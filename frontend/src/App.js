import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import Home from './components/Home';
import Ingestor from './components/Ingestor';
import Queries from './components/Queries';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
          <div className="container">
            <Link className="navbar-brand" to="/">
              <i className="fas fa-database me-2"></i>
              Data Pipeline
            </Link>
            <div className="navbar-nav">
              <Link className="nav-link" to="/">
                Inicio
              </Link>
              <Link className="nav-link" to="/ingestor">
                Ingestor
              </Link>
              <Link className="nav-link" to="/queries">
                Consultas
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mt-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ingestor" element={<Ingestor />} />
            <Route path="/queries" element={<Queries />} />
          </Routes>
        </main>

        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </div>
    </Router>
  );
}

export default App; 