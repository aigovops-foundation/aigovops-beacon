import React from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import Wizard from "./pages/Wizard.jsx";
import ControlPlane from "./pages/ControlPlane.jsx";

export default function App() {
  return (
    <>
      <header className="nav-top">
        <Link to="/" className="brand">
          <span className="mark" aria-hidden="true" />
          <span>AIGovOps Beacon</span>
          <span className="pill" style={{ marginLeft: "0.5rem" }}>Studio</span>
        </Link>
        <nav>
          <NavLink to="/" end>Studio</NavLink>
          <NavLink to="/control">Control Plane</NavLink>
          <a
            href="https://github.com/bobrapp/aigovops-beacon"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Wizard />} />
        <Route path="/control/*" element={<ControlPlane />} />
      </Routes>
    </>
  );
}
