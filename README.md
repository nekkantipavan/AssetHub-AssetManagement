# 🏭 AssetHub — Asset Management System

A modern, warm-toned frontend built with **React + Vite + Tailwind CSS**.

---

## 📁 Folder Structure

```
asset-management/
├── public/
├── src/
│   ├── components/
│   │   ├── common/          # Reusable: Card, Button, Modal, Table, Badge, FormFields
│   │   ├── dashboard/       # StatCard
│   │   └── layout/          # Layout, Sidebar, Header
│   ├── data/
│   │   └── dummyData.js     # All sample data (assets, plants, users, etc.)
│   ├── pages/
│   │   ├── Dashboard.jsx    # Charts + stat cards
│   │   ├── Assets.jsx       # Full table + View/Edit/History modals
│   │   ├── BulkUpload.jsx   # Upload + error modal
│   │   ├── Transfer.jsx     # Transfer form + history
│   │   ├── Plants.jsx       # Plant CRUD
│   │   ├── Departments.jsx  # Department CRUD
│   │   ├── Users.jsx        # User management + roles
│   │   └── AuditLogs.jsx    # Filterable audit trail
│   ├── App.jsx              # Router
│   ├── main.jsx             # Entry point
│   └── index.css            # Tailwind + custom utility classes
├── tailwind.config.js       # Custom warm theme (brand, cream, ink)
├── vite.config.js
└── package.json
```

---

## 🚀 Run in VS Code

### Prerequisites
- Node.js v18+ (download: https://nodejs.org)
- VS Code (download: https://code.visualstudio.com)

### Steps

**1. Open the project in VS Code**
```bash
# Open VS Code, then: File → Open Folder → select "asset-management"
# Or from terminal:
code asset-management
```

**2. Open the integrated terminal**
```
View → Terminal  (or  Ctrl+` )
```

**3. Install dependencies**
```bash
npm install
```

**4. Start development server**
```bash
npm run dev
```

**5. Open in browser**
```
http://localhost:5173
```

---

## 🎨 Design System

| Token         | Value     | Usage                        |
|---------------|-----------|------------------------------|
| `brand-500`   | `#f59e0b` | Primary orange, buttons, highlights |
| `cream-100`   | `#f8f6f2` | Page background              |
| `ink-900`     | `#2e2e2e` | Primary text                 |
| `ink-300`     | `#9ca3af` | Muted / secondary text       |
| Radius        | 16–20px   | All cards and inputs         |
| Shadow        | soft/card | No harsh borders             |

### Reusable Components

| Component    | Import path                         | Props                              |
|--------------|-------------------------------------|------------------------------------|
| `Card`       | `components/common/Card`            | `highlight`, `padding`, `className` |
| `Button`     | `components/common/Button`          | `variant` (primary/secondary/ghost/danger), `size` |
| `Modal`      | `components/common/Modal`           | `isOpen`, `onClose`, `title`, `size` |
| `Table/Th/Td`| `components/common/Table`           | Composable table parts             |
| `Badge`      | `components/common/Badge`           | `label` — auto-colored by status   |
| `Input/Select`| `components/common/FormFields`     | `label`, standard HTML props       |
| `StatCard`   | `components/dashboard/StatCard`     | `icon`, `label`, `value`, `trend`, `highlight` |

---

## 🗄️ PostgreSQL — Backend Integration Guide

### 1. Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# macOS (Homebrew)
brew install postgresql@15
brew services start postgresql@15

# Windows: download installer from https://www.postgresql.org/download/windows/
```

### 2. Create Database
```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database and user
CREATE DATABASE assethub;
CREATE USER assethub_user WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE assethub TO assethub_user;
\c assethub
```

### 3. Database Schema

```sql
-- Plants table
CREATE TABLE plants (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  location    VARCHAR(200),
  head        VARCHAR(100),
  status      VARCHAR(20) DEFAULT 'Active',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Departments table
CREATE TABLE departments (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  plant_id    INTEGER REFERENCES plants(id),
  manager     VARCHAR(100),
  status      VARCHAR(20) DEFAULT 'Active',
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role         VARCHAR(20) DEFAULT 'User',  -- Admin, Manager, User
  plant_id     INTEGER REFERENCES plants(id),
  dept_id      INTEGER REFERENCES departments(id),
  status       VARCHAR(20) DEFAULT 'Active',
  last_login   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Assets table
CREATE TABLE assets (
  id                SERIAL PRIMARY KEY,
  asset_code        VARCHAR(20) UNIQUE NOT NULL,  -- AST-001
  name              VARCHAR(200) NOT NULL,
  serial_number     VARCHAR(100) UNIQUE,
  acquisition_value NUMERIC(15,2),
  plant_id          INTEGER REFERENCES plants(id),
  dept_id           INTEGER REFERENCES departments(id),
  assigned_user_id  INTEGER REFERENCES users(id),
  status            VARCHAR(30) DEFAULT 'Active',  -- Active, Inactive, In Transfer
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Transfers table
CREATE TABLE transfers (
  id              SERIAL PRIMARY KEY,
  transfer_code   VARCHAR(20) UNIQUE NOT NULL,
  asset_id        INTEGER REFERENCES assets(id),
  from_plant_id   INTEGER REFERENCES plants(id),
  to_plant_id     INTEGER REFERENCES plants(id),
  transfer_type   VARCHAR(30),  -- Returnable, Non-Returnable
  status          VARCHAR(30) DEFAULT 'Pending',
  initiated_by    INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  action      VARCHAR(100) NOT NULL,
  module      VARCHAR(50),
  user_id     INTEGER REFERENCES users(id),
  details     TEXT,
  ip_address  VARCHAR(50),
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### 4. Build the Backend (Node.js + Express)

```bash
# In a new folder (e.g. "asset-management-api")
npm init -y
npm install express pg cors dotenv bcrypt jsonwebtoken
```

**Example `.env`:**
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=assethub
DB_USER=assethub_user
DB_PASSWORD=yourpassword
JWT_SECRET=your_jwt_secret
PORT=3001
```

**Example `server.js`:**
```js
const express = require('express')
const { Pool } = require('pg')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

// Example: GET all assets
app.get('/api/assets', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, p.name AS plant_name, d.name AS dept_name, u.name AS employee_name
      FROM assets a
      LEFT JOIN plants p ON a.plant_id = p.id
      LEFT JOIN departments d ON a.dept_id = d.id
      LEFT JOIN users u ON a.assigned_user_id = u.id
      ORDER BY a.created_at DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(process.env.PORT, () =>
  console.log(`API running on port ${process.env.PORT}`)
)
```

### 5. Connect Frontend to API

In `src/data/` create `api.js`:
```js
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' }
})

// Add auth token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const getAssets     = () => api.get('/assets')
export const createAsset   = data => api.post('/assets', data)
export const updateAsset   = (id, data) => api.put(`/assets/${id}`, data)
export const deleteAsset   = id => api.delete(`/assets/${id}`)
export const getPlants     = () => api.get('/plants')
export const getDepartments= () => api.get('/departments')
export const getUsers      = () => api.get('/users')
export const getAuditLogs  = () => api.get('/audit-logs')
export const initiateTransfer = data => api.post('/transfers', data)

export default api
```

Then in your page components, replace `import { assets } from '../data/dummyData'` with:
```js
import { useState, useEffect } from 'react'
import { getAssets } from '../data/api'

const [assets, setAssets] = useState([])
useEffect(() => {
  getAssets().then(res => setAssets(res.data))
}, [])
```

---

## 🛠️ Recommended VS Code Extensions

- **ES7+ React/Redux/React-Native snippets** — fast component scaffolding
- **Tailwind CSS IntelliSense** — autocomplete for Tailwind classes
- **Prettier** — code formatting
- **ESLint** — lint errors in real time
- **Thunder Client** — test API endpoints inside VS Code

---

## 📦 Build for Production

```bash
npm run build        # Creates dist/ folder
npm run preview      # Preview the production build
```

Deploy the `dist/` folder to any static host: **Vercel, Netlify, Nginx, Apache**.
