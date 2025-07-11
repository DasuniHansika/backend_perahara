# Perahera Gallery Server

Backend API server for the Perahera Gallery booking application.

## Environment Setup

### 1. Environment Variables

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
```

### 2. Required Environment Variables

- **Database Configuration:**

  - `DB_HOST`: Database host (default: localhost)
  - `DB_USER`: Database username (default: root)
  - `DB_PASSWORD`: Database password
  - `DB_NAME`: Database name (default: gallery)
  - `DB_CONNECTION_LIMIT`: Connection pool limit (default: 10)

- **Firebase Configuration:**

  - `FIREBASE_PROJECT_ID`: Your Firebase project ID
  - `FIREBASE_CLIENT_EMAIL`: Firebase service account email
  - `FIREBASE_PRIVATE_KEY`: Firebase service account private key

- **JWT Configuration:**

  - `JWT_SECRET`: Secret key for JWT tokens (change in production)
  - `JWT_EXPIRES_IN`: JWT token expiration time (default: 90d)

- **Server Configuration:**

  - `PORT`: Server port (default: 3000)
  - `NODE_ENV`: Environment (development/production)

- **Email Verification:**
  - `EMAIL_VERIFICATION_REDIRECT_URL`: Redirect URL after email verification

### 3. Installation

```bash
npm install
```

### 4. Running the Server

**Development:**

```bash
npm run start:dev
```

**Production:**

```bash
npm start
```

**Clean start (no deprecation warnings):**

```bash
npm run start:clean
```

### 5. Database Setup

The server will automatically initialize the database schema on first run. Make sure your MySQL server is running and the credentials in `.env` are correct.

### 6. Firebase Setup

You can configure Firebase in two ways:

1. **Service Account File:** Place your `serviceAccountKey.json` in the `config` directory
2. **Environment Variables:** Set the Firebase environment variables in `.env`

### 7. Security Notes

- Change the `JWT_SECRET` in production
- Use strong database passwords
- Never commit `.env` files to version control
- Regularly rotate Firebase service account keys

## API Endpoints

The server provides REST API endpoints for:

- User authentication and management
- Booking and cart management
- Payment processing
- Shop and seller management
- Admin functionality

See the API documentation for detailed endpoint information.
