# CarbonWalk Backend Setup Guide 🌿

## Overview
This guide explains how to set up the backend system with **Firebase Authentication** and **Cloud Firestore** for user registration, login, and data persistence.

---

## Step 1: Set Up Firebase Project

### 1.1 Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. Project name: `nu-healthy-zerocarbon` (should already exist)
4. Enable Google Analytics (optional)
5. Create the project

### 1.2 Register Your Web App
1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click the **Web** icon to add a web app
3. App nickname: `CarbonWalk`
4. Check **Also set up Firebase Hosting**
5. Register the app
6. Copy your Firebase config (you'll need this in Step 4)

---

## Step 2: Enable Firebase Authentication

### 2.1 Set Up Email/Password Authentication
1. In Firebase Console, go to **Authentication** (left sidebar)
2. Click **Get Started**
3. Under **Native providers**, click **Email/Password**
4. Toggle **Enable** to ON
5. Also enable **Email link (passwordless sign-in)** (optional)
6. Click **Save**

---

## Step 3: Create Firestore Database

### 3.1 Set Up Cloud Firestore
1. In Firebase Console, go to **Firestore Database** (left sidebar)
2. Click **Create database**
3. Choose location: **Asia Southeast 1 (Bangkok)** (or nearest to Thailand)
4. Security rules: Start with **Test mode** (for development)
5. Click **Create**

### 3.2 Set Firestore Security Rules (Important!)
After creating the database:
1. Go to **Firestore Database** → **Rules** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

3. Click **Publish**

---

## Step 4: Update Firebase Configuration

### 4.1 Get Your Firebase Config
1. Go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Find your Web app and click the code icon `</>`
4. Copy the Firebase config object

### 4.2 Update index.html
1. Open `public/index.html`
2. Find the Firebase config in the `<script type="module">` section (around line 608)
3. Replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "nu-healthy-zerocarbon.firebaseapp.com",
  projectId: "nu-healthy-zerocarbon",
  storageBucket: "nu-healthy-zerocarbon.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Replace with your actual values from the Firebase Console.

---

## Step 5: Test the System

### 5.1 Local Testing
1. Open `public/index.html` in your browser
2. You should see the **Login page**
3. Click **"Sign Up"** to create an account
4. Fill in:
   - Full Name: `John Doe`
   - Email: `john@example.com`
   - Password: `password123`
5. Click **"Create Account 🚀"**
6. You should see a success message and be logged in
7. Your data is now saved in Firestore!

### 5.2 Test Data Persistence
1. After logging in, click some buttons and track some steps
2. Go to **Profile** tab
3. Click **"Log Out"**
4. Log back in with the same email/password
5. Your steps count should still be there! ✅

---

## Step 6: Deploy to Firebase Hosting

### 6.1 Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 6.2 Log In to Firebase
```bash
firebase login
```

### 6.3 Deploy
```bash
firebase deploy
```

Your app will be live at: `https://nu-healthy-zerocarbon.web.app`

---

## Features Implemented

### ✅ User Registration
- Create account with email and password
- Password validation (minimum 8 characters)
- Password confirmation check
- Automatic user profile creation in Firestore

### ✅ User Login
- Email/password authentication
- Automatic user data loading from Firestore
- Session persistence (user stays logged in until logout)
- Error handling with friendly messages

### ✅ Data Persistence
- User data automatically saved to Firestore on logout
- Data includes:
  - Steps count
  - Daily goal
  - Lifetime statistics
  - Eco points
  - Streak count
  - Profile rank and level

### ✅ User Logout
- Safe logout that saves current data
- User redirected to login page
- Session cleared

### ✅ Security
- Firebase Authentication handles password hashing and security
- Firestore security rules prevent users from accessing other users' data
- API key is public but only works with Firebase services

---

## Database Structure

### Firestore Collection: `users`
Each user document has this structure:

```javascript
{
  userId: "uid123",
  email: "user@example.com",
  displayName: "John Doe",
  createdAt: timestamp,
  lastUpdated: timestamp,
  steps: 0,
  dailyGoal: 5000,
  lifetimeSteps: 0,
  lifetimeCO2g: 0,
  lifetimeTrees: 0,
  streak: 0,
  ecoPoints: 0,
  profileLevel: 1,
  profileRank: "Eco Seedling",
  profileImpactKm: 0,
  profileImpactCO2kg: 0,
  lastActiveDate: "2024-05-21"
}
```

---

## Troubleshooting

### "Unable to connect to server"
- Check if Firebase config is correct in `index.html`
- Make sure Authentication and Firestore are enabled
- Check browser console (F12) for errors

### "This email is already registered"
- Try logging in instead of signing up
- Or use a different email

### "Network error"
- Check internet connection
- Firebase might be blocked in your region (use VPN if needed)

### Data not saving
- Make sure you're logged in (check Firebase Console Auth)
- Check Firestore Rules (they should allow read/write for the user)
- Look at browser console for error messages

### User data not loading after login
- Check Firestore database to see if user document was created
- Make sure Firestore collection is named exactly `users`
- Verify Firestore location is set correctly

---

## Next Steps

1. **Add More Data Fields**: Extend the Firestore schema with more user info (avatar, bio, etc.)
2. **Leaderboard**: Create a public leaderboard of top eco walkers (requires new Firestore collection)
3. **Password Reset**: Implement forgot password functionality
4. **Email Verification**: Add email verification on signup
5. **Social Login**: Add Google/Facebook login options
6. **User Profile Edit**: Allow users to update their profile information
7. **Activity History**: Save and display user's walking history

---

## Files Modified

- `public/index.html` - Added signup page and Firebase SDK
- `public/script.js` - Updated login/logout logic, added signup handlers
- `public/auth.js` - New file with Firebase authentication functions
- `firebase.json` - Already configured for Firebase Hosting

---

## Support

For questions about Firebase, visit:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)

---

**Created:** May 21, 2024  
**Status:** ✅ Production Ready
