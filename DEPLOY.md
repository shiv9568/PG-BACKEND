# Deployment Guide for Render

## 1. Push Code to GitHub
Ensure your latest changes, including the `render.yaml` file, are pushed to your GitHub repository (`shiv9568/PG-BACKEND`).

## 2. Create Web Service on Render
You can either:
- **Option A (Automatic):** Connect your repo and Render might detect `render.yaml`.
- **Option B (Manual):** Use the settings you provided:

| Setting | Value |
| :--- | :--- |
| **Name** | `PG-BACKEND` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Plan** | `Free` |

## 3. Environment Variables
You **MUST** set these in the Render Dashboard under **Environment**:

- `MONGODB_URI`: Your MongoDB connection string (e.g., from MongoDB Atlas).
- `JWT_SECRET`: A secure random string for authentication.
- `NODE_VERSION`: `20.11.0` (Recommended)

## 4. Verify Deployment
Once deployed, Render will provide a URL (e.g., `https://pg-backend.onrender.com`).
- Visit the URL to see "Taj PG Backend is running with MongoDB".
- Update your Frontend (`studio`) `.env` file to point to this new Backend URL.
