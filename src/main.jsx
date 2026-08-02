import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { WalletProvider } from './wallet.jsx'
import { AuthProvider } from './auth.jsx'
import './styles.css'

// AuthProvider wraps WalletProvider — the wallet reads the session to decide
// between cloud and local mode.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </AuthProvider>
  </React.StrictMode>
)
