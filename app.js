// ✅ Import complet (sans espaces)
import { 
  getAuth, 
  signInWithPhoneNumber, 
  RecaptchaVerifier 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { 
  getStorage, 
  ref, 
  uploadBytes 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// === Variables globales ===
let currentUser = null;

// === Gestion des écrans ===
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}

// === Inscription utilisateur ===
async function registerUser() {
  const name = document.getElementById('register-name').value.trim();
  const phoneInput = document.getElementById('register-phone').value.trim();
  const quartier = document.getElementById('register-quartier').value.trim();
  const role = document.getElementById('register-role').value;

  if (!name || !phoneInput) return alert("Nom et téléphone obligatoires");

  // Formatage du numéro
  const phone = phoneInput.startsWith('+') ? phoneInput : '+237' + phoneInput.replace(/^6/, '').padStart(8, '6');

  try {
    await addDoc(collection(db, "users"), {
      name, phone, quartier, role,
      status: "actif",
      points: 0,
      wallet: 5000,
      kycSubmitted: false,
      kycValidated: false,
      createdAt: new Date()
    });
    alert("✅ Compte créé ! Connectez-vous maintenant.");
    showLogin();
  } catch (e) {
    alert("Erreur : " + e.message);
  }
}

// === Connexion par SMS ===
async function loginWithPhone() {
  const phoneInput = document.getElementById('login-phone').value.trim();
  if (!phoneInput) return alert("Entrez un numéro");

  const phone = phoneInput.startsWith('+') ? phoneInput : '+237' + phoneInput.replace(/^6/, '').padStart(8, '6');

  try {
    window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
      'size': 'invisible',
      'callback': () => console.log('reCAPTCHA prêt')
    }, auth);

    const confirmationResult = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
    window.confirmationResult = confirmationResult;

    const code = prompt("Entrez le code SMS reçu :");
    if (!code) return;

    const userCredential = await confirmationResult.confirm(code);
    const user = userCredential.user;
    alert(`✅ Connecté en tant que ${user.phoneNumber}`);
    
  } catch (error) {
    console.error("Erreur SMS :", error);
    alert("Échec de l'envoi du SMS. Vérifiez le numéro.");
  }
}

// === Chargement après connexion ===
async function loadApp() {
  if (!currentUser) {
    showScreen('auth-screen');
    return;
  }

  const phone = currentUser.phoneNumber;
  if (!phone) return alert("Numéro non disponible");

  try {
    const q = query(collection(db, "users"), where("phone", "==", phone));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("Utilisateur non trouvé. Veuillez vous inscrire.");
      showScreen('auth-screen');
      return;
    }

    const doc = querySnapshot.docs[0];
    const userData = doc.data();
    const userId = doc.id;

    currentUser.data = userData;
    currentUser.docId = userId;

    // 🔐 Super-admin ?
    if (phone === "+237699000000") {
      showScreen('admin-ui');
      loadAdminDashboard();
    }
    // 🛂 En attente de KYC ?
    else if ((userData.role === 'agent' || userData.role === 'transporteur') && !userData.kycValidated) {
      showScreen('kyc-screen');
    }
    // ✅ Passager ou agent validé
    else {
      showScreen('passager-ui');
      document.getElementById('user-name').textContent = userData.name.split(' ')[0];
    }

  } catch (error) {
    console.error("Erreur loadApp :", error);
    alert("Erreur de chargement.");
  }
}

// === Soumission KYC ===
document.getElementById('kyc-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = [
    document.getElementById('file-permis').files[0],
    document.getElementById('file-grise').files[0],
    document.getElementById('file-assurance').files[0],
    document.getElementById('file-cni').files[0],
    document.getElementById('file-vehicule').files[0]
  ];

  if (files.some(f => !f)) return alert("Veuillez soumettre tous les fichiers.");

  try {
    for (let i = 0; i < files.length; i++) {
      const fileRef = ref(storage, `kyc/${currentUser.uid}/doc_${i}.jpg`);
      await uploadBytes(fileRef, files[i]);
    }

    await updateDoc(doc(db, "users", currentUser.docId), { kycSubmitted: true });
    alert("✅ KYC soumis ! En attente de validation.");
    showScreen('passager-ui');
  } catch (e) {
    alert("Erreur upload : " + e.message);
  }
});

// === Dashboard Admin ===
async function loadAdminDashboard() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const users = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const pending = users.filter(u => u.kycSubmitted && !u.kycValidated);

    const container = document.getElementById('kyc-requests');
    container.innerHTML = pending.length ? '' : '<p>Aucun KYC en attente.</p>';

    pending.forEach(u => {
      const div = document.createElement('div');
      div.className = 'kyc-item';
      div.innerHTML = `
        <p><strong>${u.name}</strong> (${u.role})</p>
        <button class="btn-accept" onclick="validateKYC('${u.id}', true)">Valider</button>
        <button class="btn-reject" onclick="validateKYC('${u.id}', false)">Rejeter</button>
      `;
      container.appendChild(div);
    });

  } catch (e) {
    console.error("Erreur dashboard :", e);
  }
}

// === Valider KYC ===
async function validateKYC(userId, approve) {
  try {
    await updateDoc(doc(db, "users", userId), { 
      kycValidated: approve,
      status: approve ? "validé" : "rejeté"
    });
    alert(`KYC ${approve ? "✅ validé" : "❌ rejeté"}`);
    loadAdminDashboard();
  } catch (e) {
    alert("Erreur : " + e.message);
  }
}

// === Onglets Admin ===
function openTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabName).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// === Navigation passager ===
function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.getElementById(sectionId).style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}