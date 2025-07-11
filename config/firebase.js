
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPaths = [
  path.join(__dirname, "..", "..", "serviceAccountKey.json"),
  path.join(__dirname, "..", "serviceAccountKey.json"),
  path.join(__dirname, "..", "config", "serviceAccountKey.json"),
];

let isInitialized = false;

const initializeFirebaseAdmin = () => {
  if (isInitialized) return true;

  try {
    let serviceAccount = null;
    let serviceAccountPath = null;

    // Try to find the service account key file
    for (const potentialPath of serviceAccountPaths) {
      if (fs.existsSync(potentialPath)) {
        serviceAccountPath = potentialPath;
        serviceAccount = require(potentialPath);
        console.log("Found Firebase service account key at:", serviceAccountPath);
        break;
      }
    }

    // If no service account file found, check environment variables
    if (!serviceAccount) {
      if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      ) {
        console.log("Initializing Firebase Admin with environment variables");
        serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        };
      }
    }

    // Initialize with the service account or default credentials
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id || serviceAccount.projectId}.firebaseio.com`
      });
    } else {
      console.warn("Initializing with application default credentials");
      admin.initializeApp();
    }

    isInitialized = true;
    console.log("Firebase Admin SDK initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    return false;
  }
};

const getAuth = () => {
  if (!isInitialized) {
    throw new Error("Firebase Admin not initialized. Call initializeFirebaseAdmin() first.");
  }
  return admin.auth();
};

const getFirestore = () => {
  if (!isInitialized) {
    throw new Error("Firebase Admin not initialized. Call initializeFirebaseAdmin() first.");
  }
  return admin.firestore();
};

module.exports = {
  admin,
  initializeFirebaseAdmin,
  getAuth,
  getFirestore,
  isInitialized: () => isInitialized
};