// === Initialisation Firebase (SDK direct) ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmi26-MhQawuwE15yB9NvzutNyndRJpUM",
  authDomain: "travelhub-africa.firebaseapp.com",
  projectId: "travelhub-africa",
  storageBucket: "travelhub-africa.firebasestorage.app",
  messagingSenderId: "1078235002249",
  appId: "1:1078235002249:web:8d569ed1fd7e09b9081d58"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();
let currentUser = null;

// === Gestion des écrans ===
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function showRegister() { document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; }
function showLogin() { document.getElementById('register-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; }

// === Inscription utilisateur ===
async function registerUser() {
  const name = document.getElementById('register-name').value;
  const phone = document.getElementById('register-phone').value.replace(/\s/g, '');
  const quartier = document.getElementById('register-quartier').value;
  const role = document.getElementById('register-role').value;

  if (!name || !phone || phone.length < 9) return alert("Nom et téléphone obligatoires");

  try {
    await addDoc(collection(db, "users"), {
      name, phone, quartier, role, status: "actif", points: 0, wallet: 5000, kycSubmitted: false, kycValidated: false, createdAt: new Date()
    });
    alert("✅ Compte créé ! Connectez-vous maintenant.");
    showLogin();
  } catch (e) {
    alert("Erreur : " + e.message);
  }
}

// Fonction pour la vérification par SMS
function loginWithPhone() {
  const phoneNumber = document.getElementById('login-phone').value;
  if (!phoneNumber.startsWith('+')) {
    alert("Veuillez entrer un numéro de téléphone valide (+237...)");
    return;
  }

  // Créer le vérificateur reCAPTCHA
  window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
    'size': 'invisible',
    'callback': () => {}
  }, auth);

  // Envoyer le code SMS
  signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier)
    .then(confirmationResult => {
      // Stocke le résultat pour valider le code
      window.confirmationResult = confirmationResult;
      alert("SMS envoyé ! Vérifiez votre téléphone.");
    })
    .catch(error => {
      console.error("Erreur lors de l'envoi du SMS :", error);
      alert("Impossible d'envoyer le SMS. Réessayez plus tard.");
    });
}

// Vérifier le code SMS
function verifyCode() {
  const code = prompt("Entrez le code SMS reçu :");
  if (!code) return;

  window.confirmationResult
    .confirm(code)
    .then((userCredential) => {
      // Utilisateur connecté
      const user = userCredential.user;
      alert(`Bienvenue, ${user.phoneNumber} !`);
      // Redirige vers l'accueil ou autre page
    })
    .catch((error) => {
      console.error("Erreur de vérification du code :", error);
      alert("Code incorrect. Réessayez.");
    });
}

// === Chargement après connexion ===
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const userDocs = await getDocs(collection(db, "users"));
    const userData = userDocs.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.phone === user.phoneNumber);
    if (!userData) return alert("Utilisateur non trouvé dans la base.");

    currentUser.data = userData;

    if (user.phoneNumber === "+237699000000") { // 🔐 Super-admin
      showScreen('admin-ui');
      loadAdminDashboard();
    } else if ((userData.role === 'agent' || userData.role === 'transporteur') && !userData.kycValidated) {
      showScreen('kyc-screen');
    } else {
      showScreen('passager-ui');
      document.getElementById('user-name').textContent = userData.name.split(' ')[0];
    }
  } else {
    showScreen('auth-screen');
  }
});

// === Soumission KYC ===
document.getElementById('kyc-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = ['permis', 'grise', 'assurance', 'cni', 'vehicule'].map(id => document.getElementById('file-' + id).files[0]);
  if (files.some(f => !f)) return alert("Tous les fichiers sont obligatoires");

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileRef = ref(storage, `kyc/${currentUser.uid}/doc_${i}.jpg`);
      await uploadBytes(fileRef, file);
    }
    await updateDoc(doc(db, "users", currentUser.data.id), { kycSubmitted: true });
    alert("✅ KYC soumis ! En attente de validation.");
    showScreen('passager-ui');
    sendNotificationToAdmin("KYC soumis", currentUser.data.name);
  } catch (e) {
    alert("Erreur upload : " + e.message);
  }
});

// === Notifications admin (simulées) ===
function sendNotificationToAdmin(title, message) {
  console.log(`🔔 [Admin] ${title}: ${message}`);
  // En vrai : Africa’s Talking ou FCM
}

// === Dashboard Admin ===
async function loadAdminDashboard() {
  const usersSnap = await getDocs(collection(db, "users"));
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pending = users.filter(u => u.kycSubmitted && !u.kycValidated);

  const container = document.getElementById('kyc-requests');
  container.innerHTML = pending.length ? '' : '<p>Aucun KYC en attente.</p>';

  pending.forEach(u => {
    const div = document.createElement('div');
    div.className = 'kyc-item';
    div.innerHTML = `<p><strong>${u.name}</strong> (${u.role})</p>
      <button class="btn-accept" onclick="validateKYC('${u.id}', true)">Valider</button>
      <button class="btn-reject" onclick="validateKYC('${u.id}', false)">Rejeter</button>`;
    container.appendChild(div);
  });
}

// === Valider KYC ===
async function validateKYC(userId, approve) {
  await updateDoc(doc(db, "users", userId), { kycValidated: approve, status: approve ? "validé" : "rejeté" });
  alert(`KYC ${approve ? "✅ validé" : "❌ rejeté"}`);
  loadAdminDashboard();
}

// === Onglets Admin ===
function openTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabName).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}