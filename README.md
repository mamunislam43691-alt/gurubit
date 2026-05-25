# GURUBIT - SMS/OTP Platform

Mobile-first temporary phone number platform for receiving SMS and OTP messages. Built with Firebase, Express, and WebSocket for real-time functionality.

## 🚀 Features

- **Firebase Authentication** - Secure user authentication
- **Cloud Firestore** - Real-time NoSQL database
- **Real-time SMS Feed** - Live SMS updates via WebSocket
- **Mobile-First Design** - Responsive UI with Tailwind CSS
- **Earnings System** - User rewards for successful OTPs
- **Admin Panel** - Complete platform management
- **Live Data Only** - No test/demo data, production-ready

## 🛠️ Tech Stack

### Frontend
- HTML5, CSS3, JavaScript ES6+
- Tailwind CSS - Mobile-first responsive design
- Firebase SDK - Client-side authentication
- WebSocket - Real-time communication

### Backend
- Node.js & Express - Web server
- Firebase Admin SDK - Server-side operations
- Cloud Firestore - Database
- WebSocket (ws) - Real-time messaging

## 📋 Prerequisites

- Node.js >= 14.0.0
- Firebase account
- npm or yarn

## 🔧 Installation

### 1. Clone Repository

```bash
cd GURUBIT
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Firebase Setup

**বিস্তারিত setup guide:** [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) (বাংলায়)

1. Firebase Console এ project তৈরি করুন
2. Authentication enable করুন (Email/Password)
3. Cloud Firestore enable করুন
4. Web app register করুন এবং config copy করুন
5. Service account key download করুন

### 4. Configure Environment

```bash
cp .env.example .env
```

`.env` file edit করুন:

```env
PORT=3000
NODE_ENV=development

# Firebase service account key (JSON string)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com

SESSION_SECRET=your-secret-key
SESSION_EXPIRY_HOURS=24
API_BASE_URL=http://localhost:3000
```

### 5. Update Firebase Config

`public/js/firebase-config.js` file এ আপনার Firebase config add করুন:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

Server will start at http://localhost:3000

### Production Mode

```bash
npm start
```

### Build CSS

```bash
# Build once
npm run build:css

# Watch mode
npm run watch:css
```

## 📁 Project Structure

```
GURUBIT/
├── config/
│   ├── firebase.js                    # Backend Firebase setup
│   └── serviceAccountKey.example.json # Service account template
├── middleware/
│   └── authMiddleware.js              # Authentication middleware
├── routes/
│   └── authRoutes.js                  # Auth API endpoints
├── public/
│   ├── css/                           # Stylesheets
│   ├── js/
│   │   ├── firebase-config.js         # Frontend Firebase config
│   │   ├── app.js                     # Main app
│   │   └── components/
│   │       └── AuthPage.js            # Authentication component
│   └── index.html                     # Main HTML
├── server.js                          # Express + WebSocket server
├── .env.example                       # Environment template
├── FIREBASE_SETUP.md                  # Firebase setup guide (বাংলায়)
├── MIGRATION_TO_FIREBASE.md           # Migration notes
└── README.md                          # This file
```

## 🔐 Security

- Firebase Authentication for user management
- Firestore security rules for data access control
- HTTP-only cookies for session management
- Token verification middleware
- Environment variables for sensitive data

## 📚 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/session` - Validate session

### User (Coming Soon)
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `GET /api/user/dashboard` - Dashboard stats
- `POST /api/user/withdrawal` - Request withdrawal

### SMS (Coming Soon)
- `GET /api/countries` - Available countries
- `POST /api/numbers/generate` - Generate number
- `GET /api/sms/live-feed` - Live SMS feed

### Admin (Coming Soon)
- `GET /api/admin/dashboard` - Admin stats
- `GET /api/admin/users` - User management
- `GET /api/admin/withdrawals` - Withdrawal management

## 🔌 WebSocket Events

### Client → Server
- `subscribe_sms_feed` - Subscribe to live SMS
- `subscribe_user_updates` - Subscribe to user updates
- `subscribe_admin_updates` - Subscribe to admin updates

### Server → Client
- `connection_established` - Connection confirmed
- `subscription_confirmed` - Subscription acknowledged
- `sms_received` - New SMS message
- `otp_success` - OTP received
- `earnings_updated` - Earnings changed
- `dashboard_updated` - Stats updated

## 🗄️ Firestore Collections

- `users` - User accounts and profiles
- `sessions` - Active sessions
- `countries` - Available countries
- `servers` - SMS servers
- `phoneNumbers` - Temporary numbers
- `platforms` - Third-party platforms
- `smsMessages` - Received messages
- `withdrawalRequests` - Withdrawal requests
- `apiKeys` - API credentials

## 📖 Documentation

- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Complete Firebase setup guide (বাংলায়)
- [MIGRATION_TO_FIREBASE.md](./MIGRATION_TO_FIREBASE.md) - MySQL to Firebase migration notes
- [SETUP.md](./SETUP.md) - General setup guide

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

## 📝 License

ISC

## 🎯 Development Status

- ✅ Project structure initialized
- ✅ Firebase integration complete
- ✅ Authentication system ready
- ✅ Database schema designed
- 🔄 User features in progress
- 🔄 Admin panel in progress
- 🔄 SMS processing in progress

## 📞 Support

For setup help or issues:
1. Check [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
2. Review [MIGRATION_TO_FIREBASE.md](./MIGRATION_TO_FIREBASE.md)
3. Contact development team

---

**Built with ❤️ using Firebase, Express, and modern web technologies**
