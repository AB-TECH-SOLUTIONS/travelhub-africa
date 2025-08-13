// === Initialisation Firebase (SDK direct) ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "travelhub-africa.firebaseapp.com",
  projectId: "travelhub-africa",
  storageBucket: "travelhub-africa.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef12345"
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

// === Connexion par SMS (Phone Auth) ===
window.recaptchaVerifier = new RecaptchaVerifier('login-form', {
  'size': 'invisible',
  'callback': () => {}
}, auth);

async function loginWithPhone() {
  const phoneInput = document.getElementById('login-phone').value;
  const phoneNumber = phoneInput.startsWith('+') ? phoneInput : '+237' + phoneInput.replace(/^6/, '').padStart(8, '6');

  try {
    const appVerifier = window.recaptchaVerifier;
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    const code = prompt("Entrez le code SMS reçu :");
    const userCredential = await confirmationResult.confirm(code);
    currentUser = userCredential.user;
    loadApp();
  } catch (error) {
    alert("Échec de connexion : " + error.message);
  }
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