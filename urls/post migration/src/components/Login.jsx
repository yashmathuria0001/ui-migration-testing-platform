import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Store username for dashboard display
    localStorage.setItem("username", username);
    navigate("/dashboard");
  };

  return (
    <div className="login-page">
      <div className="banner"></div>

      <div className="branding">
        <h1>HomeLend Pro</h1>
        <p>Your trusted partner in mortgage and home loan solutions</p>
      </div>

      <div className="login-container">
        <div className="login-box">
          <h2>Account Login</h2>
          <p className="login-subtitle">Access your home loan dashboard</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            <button type="submit" className="login-button">
              Sign In
            </button>
          </form>

          <div className="login-footer">
            <p>Secure access to your mortgage account</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
