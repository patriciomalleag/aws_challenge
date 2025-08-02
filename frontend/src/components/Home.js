import React from 'react';
import { Link } from 'react-router-dom';
import { FaUpload, FaSearch, FaDatabase, FaChartLine, FaRocket, FaCloudUploadAlt, FaBolt } from 'react-icons/fa';

function Home() {
  return (
    <div className="animate-fadeIn">
      {/* Header con logos */}
      <div className="hero-header">
        <div className="logos-container">
          <img src="/assets/immune.png" alt="Immune" className="logo logo-immune" />
          <div className="divider"></div>
          <img src="/assets/aws_academy.png" alt="AWS Academy" className="logo logo-aws" />
        </div>
      </div>

      {/* Hero Section Modernizada */}
      <div className="hero-section-modern">
        <div className="hero-background">
          <div className="hero-gradient"></div>
          <div className="hero-pattern"></div>
        </div>
        
        <div className="hero-content">
          <div className="hero-badge">
            <FaRocket className="hero-badge-icon" />
            <span>AWS Data Pipeline Platform</span>
          </div>
          
          <h1 className="hero-title">
            Plataforma de <span className="text-gradient">Datos</span> Inteligente
          </h1>
          
          <p className="hero-description">
            Transforma tus datos con nuestra plataforma moderna de ingesta y análisis. 
            Sube, procesa y consulta archivos CSV con potencia de AWS y simplicidad de un click.
          </p>
          
          <div className="hero-actions">
            <Link to="/ingestor" className="cta-button cta-primary">
              <FaCloudUploadAlt className="cta-icon" />
              <span className="cta-text">
                <strong>Ingestar Datos</strong>
                <small>Sube y procesa tus archivos</small>
              </span>
            </Link>
            
            <Link to="/queries" className="cta-button cta-secondary">
              <FaBolt className="cta-icon" />
              <span className="cta-text">
                <strong>Consultar</strong>
                <small>Analiza con SQL inteligente</small>
              </span>
            </Link>
          </div>
          
          <div className="hero-stats">
            <div className="stat">
              <div className="stat-number">100%</div>
              <div className="stat-label">Serverless</div>
            </div>
            <div className="stat">
              <div className="stat-number">~5s</div>
              <div className="stat-label">Tiempo de procesamiento</div>
            </div>
            <div className="stat">
              <div className="stat-number">SQL</div>
              <div className="stat-label">Consultas nativas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section Modernizada */}
      <div className="features-section">
        <div className="features-header">
          <h2 className="features-title">¿Por qué elegir nuestra plataforma?</h2>
          <p className="features-subtitle">Tecnología de vanguardia para el análisis de datos moderno</p>
        </div>
        
        <div className="features-grid">
          <div className="feature-card-modern animate-slideIn">
            <div className="feature-icon-modern feature-upload">
              <FaCloudUploadAlt />
            </div>
            <div className="feature-content">
              <h3>Ingesta Inteligente</h3>
              <p>
                Sistema de drag & drop con detección automática de esquemas CSV. 
                Validación en tiempo real y configuración flexible de tipos de datos.
              </p>
              <div className="feature-tags">
                <span className="tag">Auto Schema</span>
                <span className="tag">Drag & Drop</span>
                <span className="tag">Validation</span>
              </div>
            </div>
          </div>
          
          <div className="feature-card-modern animate-slideIn" style={{ animationDelay: '0.1s' }}>
            <div className="feature-icon-modern feature-query">
              <FaBolt />
            </div>
            <div className="feature-content">
              <h3>SQL Lightning</h3>
              <p>
                Motor SQL ultrarrápido sobre SQLite. Consultas complejas, joins, 
                agregaciones y filtros con rendimiento optimizado.
              </p>
              <div className="feature-tags">
                <span className="tag">Sub-segundo</span>
                <span className="tag">SQL Completo</span>
                <span className="tag">Joins</span>
              </div>
            </div>
          </div>
          
          <div className="feature-card-modern animate-slideIn" style={{ animationDelay: '0.2s' }}>
            <div className="feature-icon-modern feature-storage">
              <FaDatabase />
            </div>
            <div className="feature-content">
              <h3>Almacenamiento AWS</h3>
              <p>
                S3 + DynamoDB para máxima durabilidad y disponibilidad. 
                Catálogo de metadatos automático y versionado de archivos.
              </p>
              <div className="feature-tags">
                <span className="tag">99.9% Uptime</span>
                <span className="tag">S3 + DDB</span>
                <span className="tag">Metadata</span>
              </div>
            </div>
          </div>
          
          <div className="feature-card-modern animate-slideIn" style={{ animationDelay: '0.3s' }}>
            <div className="feature-icon-modern feature-processing">
              <FaRocket />
            </div>
            <div className="feature-content">
              <h3>Serverless ETL</h3>
              <p>
                Procesamiento automático con AWS Lambda. Escalado automático, 
                sin servidores que mantener, pago solo por uso.
              </p>
              <div className="feature-tags">
                <span className="tag">Auto-scale</span>
                <span className="tag">Pay-per-use</span>
                <span className="tag">Lambda</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Call to Action Final */}
      <div className="cta-section">
        <div className="cta-content">
          <h2>¿Listo para transformar tus datos?</h2>
          <p>Únete a la próxima generación de análisis de datos con tecnología AWS</p>
          <Link to="/ingestor" className="cta-button cta-large">
            <FaRocket className="cta-icon" />
            Comenzar Ahora
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home; 