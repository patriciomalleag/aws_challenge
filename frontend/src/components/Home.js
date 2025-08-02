import React from 'react';
import { Link } from 'react-router-dom';
import { FaUpload, FaSearch, FaDatabase, FaChartLine } from 'react-icons/fa';

function Home() {
  return (
    <div>
      <div className="hero-section">
        <h1>Pipeline de Datos</h1>
        <p>Gestiona, ingesta y consulta tus datos de manera eficiente</p>
        
        <div className="action-buttons">
          <Link to="/ingestor" className="action-button btn-ingestor">
            <FaUpload />
            Ingestor de Datos
          </Link>
          <Link to="/queries" className="action-button btn-queries">
            <FaSearch />
            Consultas
          </Link>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6 mb-4">
          <div className="feature-card">
            <div className="feature-icon">
              <FaUpload />
            </div>
            <h3>Ingesta de Datos</h3>
            <p>
              Sube archivos CSV, define esquemas personalizados y procesa tus datos
              de manera eficiente. Nuestro sistema detecta automáticamente la estructura
              de tus archivos y te permite modificarla antes de la ingesta.
            </p>
          </div>
        </div>
        
        <div className="col-md-6 mb-4">
          <div className="feature-card">
            <div className="feature-icon">
              <FaSearch />
            </div>
            <h3>Consultas Inteligentes</h3>
            <p>
              Explora tus datos con consultas SQL intuitivas. Visualiza esquemas,
              ejecuta queries complejas y obtén resultados en tiempo real.
              Todo desde una interfaz web moderna y fácil de usar.
            </p>
          </div>
        </div>
        
        <div className="col-md-6 mb-4">
          <div className="feature-card">
            <div className="feature-icon">
              <FaDatabase />
            </div>
            <h3>Almacenamiento Optimizado</h3>
            <p>
              Tus datos se almacenan en formato CSV para consultas rápidas
              y eficientes. Además, el sistema mantiene un catálogo de metadatos
              para facilitar la gestión y búsqueda de tus archivos.
            </p>
          </div>
        </div>
        
        <div className="col-md-6 mb-4">
          <div className="feature-card">
            <div className="feature-icon">
              <FaChartLine />
            </div>
            <h3>Procesamiento Automático</h3>
            <p>
              El sistema procesa automáticamente tus archivos CSV y actualiza el catálogo de metadatos. Todo el proceso
              es transparente y eficiente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home; 