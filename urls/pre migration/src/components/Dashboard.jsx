import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

function Dashboard() {
  const [username, setUsername] = useState("");
  const [activeView, setActiveView] = useState("dashboard");
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState("success");
  const [paymentDate, setPaymentDate] = useState("2026-02-20");
  const navigate = useNavigate();

  const DUE_DATE = "2026-02-27";
  const formattedDueDate = new Date(DUE_DATE).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("username");
    navigate("/");
  };

  const handlePaymentSubmit = () => {
    const selectedDate = new Date(paymentDate);
    const dueDate = new Date(DUE_DATE);

    if (selectedDate > dueDate) {
      setPopupMessage(
        "Payment date is after the due date. Late fee of $25.00 will be added. Are you sure?",
      );
      setPopupType("error");
      setShowPopup(true);
      setTimeout(() => {
        setShowPopup(false);
      }, 4000);
    } else {
      setPopupMessage("Payment submitted successfully!");
      setPopupType("success");
      setShowPopup(true);
      setTimeout(() => {
        setShowPopup(false);
      }, 3000);
    }
  };

  const handleStartChat = () => {
    setPopupMessage("Starting chat session...");
    setPopupType("success");
    setShowPopup(true);
    setTimeout(() => {
      setShowPopup(false);
    }, 3000);
  };

  const handleSendMessage = () => {
    const subject = document.getElementById("contact-subject").value;
    const email = document.getElementById("contact-email").value;
    const phone = document.getElementById("contact-phone").value;
    const message = document.getElementById("contact-message").value;

    if (!email || !phone || !message) {
      setPopupMessage("Please fill in all required information!");
      setPopupType("error");
      setShowPopup(true);
      setTimeout(() => {
        setShowPopup(false);
      }, 3000);
      return;
    }

    setPopupMessage(
      "Message sent successfully! We'll respond within 24 hours.",
    );
    setPopupType("success");
    setShowPopup(true);
    setTimeout(() => {
      setShowPopup(false);
    }, 3000);

    // Clear form
    document.getElementById("contact-subject").value = "General Inquiry";
    document.getElementById("contact-email").value = "";
    document.getElementById("contact-phone").value = "";
    document.getElementById("contact-message").value = "";
  };

  const renderDashboardView = () => {
    return (
      <div className="dashboard-grid">
        <div className="card loan-overview">
          <h3>Loan Overview</h3>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Loan Account Number:</span>
              <span className="value">HL-2024-789456</span>
            </div>
            <div className="info-row">
              <span className="label">Property Address:</span>
              <span className="value">
                123 Maple Street, Springfield, IL 62701
              </span>
            </div>
            <div className="info-row">
              <span className="label">Loan Type:</span>
              <span className="value">30-Year Fixed Rate Mortgage</span>
            </div>
            <div className="info-row">
              <span className="label">Interest Rate:</span>
              <span className="value">3.75% APR</span>
            </div>
          </div>
        </div>

        <div className="card balance-info">
          <h3>Balance Information</h3>
          <div className="card-content">
            <div className="balance-item">
              <span className="balance-label">Original Loan Amount</span>
              <span className="balance-value">$425,000.00</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Current Principal Balance</span>
              <span className="balance-value highlight">$387,245.82</span>
            </div>
            <div className="balance-item">
              <span className="balance-label">Total Interest Paid</span>
              <span className="balance-value">$48,632.15</span>
            </div>
          </div>
        </div>

        <div className="card payment-details">
          <h3>Payment Details</h3>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Monthly Payment:</span>
              <span className="value">$2,156.78</span>
            </div>
            <div className="info-row">
              <span className="label">Next Payment Due:</span>
              <span className="value">{formattedDueDate}</span>
            </div>
            <div className="info-row">
              <span className="label">Payment Method:</span>
              <span className="value">Auto-Pay from Account ***4521</span>
            </div>
            <div className="info-row">
              <span className="label">Payment Status:</span>
              <span className="value status-current">Current</span>
            </div>
          </div>
        </div>

        <div className="card loan-timeline">
          <h3>Loan Timeline</h3>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Loan Origination Date:</span>
              <span className="value">January 15, 2022</span>
            </div>
            <div className="info-row">
              <span className="label">Maturity Date:</span>
              <span className="value">January 15, 2052</span>
            </div>
            <div className="info-row">
              <span className="label">Payments Made:</span>
              <span className="value">49 of 360</span>
            </div>
            <div className="info-row">
              <span className="label">Remaining Term:</span>
              <span className="value">25 years, 11 months</span>
            </div>
          </div>
        </div>

        <div className="card account-contact">
          <h3>Account Manager</h3>
          <div className="card-content">
            <div className="info-row">
              <span className="label">Manager Name:</span>
              <span className="value">Sarah Johnson</span>
            </div>
            <div className="info-row">
              <span className="label">Phone:</span>
              <span className="value">(555) 123-4567</span>
            </div>
            <div className="info-row">
              <span className="label">Email:</span>
              <span className="value">sjohnson@homelendpro.com</span>
            </div>
            <div className="info-row">
              <span className="label">Office Hours:</span>
              <span className="value">Mon-Fri, 8:00 AM - 6:00 PM ET</span>
            </div>
          </div>
        </div>

        <div className="card recent-activity">
          <h3>Recent Activity</h3>
          <div className="card-content">
            <div className="activity-item">
              <div className="activity-date">Feb 1, 2026</div>
              <div className="activity-desc">
                Monthly payment processed - $2,156.78
              </div>
            </div>
            <div className="activity-item">
              <div className="activity-date">Jan 1, 2026</div>
              <div className="activity-desc">
                Monthly payment processed - $2,156.78
              </div>
            </div>
            <div className="activity-item">
              <div className="activity-date">Dec 15, 2025</div>
              <div className="activity-desc">
                Annual tax statement generated
              </div>
            </div>
            <div className="activity-item">
              <div className="activity-date">Dec 1, 2025</div>
              <div className="activity-desc">
                Monthly payment processed - $2,156.78
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentView = () => {
    return (
      <div className="section-view">
        <button
          onClick={() => setActiveView("dashboard")}
          className="back-button"
        >
          <span className="back-arrow">&larr;</span> Back to Dashboard
        </button>
        <h2 className="section-title">Make a Payment</h2>

        <div className="payment-container">
          <div className="payment-summary-card">
            <h3>Payment Summary</h3>
            <div className="summary-row">
              <span>Current Amount Due:</span>
              <span className="amount">$2,156.78</span>
            </div>
            <div className="summary-row">
              <span>Due Date:</span>
              <span>{formattedDueDate}</span>
            </div>
            <div className="summary-row">
              <span>Late Fee (if paid after due date):</span>
              <span>$25.00</span>
            </div>
          </div>

          <div className="payment-form-card">
            <h3>Payment Information</h3>
            <form className="payment-form">
              <div className="form-field">
                <label>Payment Amount</label>
                <input type="text" value="$2,156.78" readOnly />
              </div>

              <div className="form-field">
                <label>Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label>Payment From</label>
                <select>
                  <option>Checking Account ****4521</option>
                  <option>Savings Account ****7839</option>
                </select>
              </div>

              <div className="form-field">
                <label>Payment Type</label>
                <select>
                  <option>Regular Payment</option>
                  <option>Principal Only</option>
                  <option>Extra Payment</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handlePaymentSubmit}
                className="submit-payment-btn"
              >
                Submit Payment
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const renderStatementsView = () => {
    return (
      <div className="section-view">
        <button
          onClick={() => setActiveView("dashboard")}
          className="back-button"
        >
          <span className="back-arrow">&larr;</span> Back to Dashboard
        </button>
        <h2 className="section-title">Loan Statements</h2>

        <div className="statements-container">
          <div className="statements-header">
            <p>View your monthly loan payment statements</p>
          </div>

          <div className="statements-table">
            <div className="table-header">
              <div className="col">Statement Period</div>
              <div className="col">Payment Amount</div>
              <div className="col">Principal Paid</div>
              <div className="col">Interest Paid</div>
              <div className="col">Status</div>
            </div>

            <div className="table-row">
              <div className="col">February 2026</div>
              <div className="col">$2,156.78</div>
              <div className="col">$987.45</div>
              <div className="col">$1,169.33</div>
              <div className="col">
                <span className="status-badge paid">Paid</span>
              </div>
            </div>

            <div className="table-row">
              <div className="col">January 2026</div>
              <div className="col">$2,156.78</div>
              <div className="col">$984.21</div>
              <div className="col">$1,172.57</div>
              <div className="col">
                <span className="status-badge paid">Paid</span>
              </div>
            </div>

            <div className="table-row">
              <div className="col">December 2025</div>
              <div className="col">$2,156.78</div>
              <div className="col">$980.98</div>
              <div className="col">$1,175.80</div>
              <div className="col">
                <span className="status-badge paid">Paid</span>
              </div>
            </div>

            <div className="table-row">
              <div className="col">November 2025</div>
              <div className="col">$2,156.78</div>
              <div className="col">$977.76</div>
              <div className="col">$1,179.02</div>
              <div className="col">
                <span className="status-badge paid">Paid</span>
              </div>
            </div>

            <div className="table-row">
              <div className="col">October 2025</div>
              <div className="col">$2,156.78</div>
              <div className="col">$974.55</div>
              <div className="col">$1,182.23</div>
              <div className="col">
                <span className="status-badge paid">Paid</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSupportView = () => {
    return (
      <div className="section-view">
        <button
          onClick={() => setActiveView("dashboard")}
          className="back-button"
        >
          <span className="back-arrow">&larr;</span> Back to Dashboard
        </button>
        <h2 className="section-title">Contact Support</h2>

        <div className="support-container">
          <div className="support-options">
            <div className="support-card">
              <h3>Phone Support</h3>
              <p className="support-detail">(555) 123-4567</p>
              <p className="support-hours">
                Monday - Friday: 8:00 AM - 8:00 PM ET
              </p>
              <p className="support-hours">Saturday: 9:00 AM - 5:00 PM ET</p>
              <p className="support-hours">Sunday: Closed</p>
            </div>

            <div className="support-card">
              <h3>Email Support</h3>
              <p className="support-detail">support@homelendpro.com</p>
              <p className="support-info">
                We typically respond within 24 hours
              </p>
            </div>

            <div className="support-card">
              <h3>Live Chat</h3>
              <p className="support-info">Available Monday - Friday</p>
              <p className="support-hours">8:00 AM - 6:00 PM ET</p>
              <button onClick={handleStartChat} className="chat-btn">
                Start Chat
              </button>
            </div>
          </div>

          <div className="contact-form-card">
            <h3>Send us a Message</h3>
            <form className="contact-form">
              <div className="form-field">
                <label>Subject</label>
                <select id="contact-subject">
                  <option>General Inquiry</option>
                  <option>Payment Question</option>
                  <option>Account Information</option>
                  <option>Technical Support</option>
                  <option>Loan Modification</option>
                </select>
              </div>

              <div className="form-field">
                <label>Email Address</label>
                <input
                  id="contact-email"
                  type="email"
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="form-field">
                <label>Phone Number</label>
                <input
                  id="contact-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="form-field">
                <label>Message</label>
                <textarea
                  id="contact-message"
                  rows="6"
                  placeholder="Please describe your inquiry..."
                ></textarea>
              </div>

              <button
                type="button"
                onClick={handleSendMessage}
                className="submit-contact-btn"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-page">
      <div className="banner"></div>

      <div className="branding">
        <h1>HomeLend Pro</h1>
        <p>Your trusted partner in mortgage and home loan solutions</p>
      </div>

      <div className="dashboard-container">
        {showPopup && (
          <div className="popup-notification">
            <div className={`popup-content ${popupType}`}>
              <span className="popup-icon">
                {popupType === "success" ? "✓" : "!"}
              </span>
              <span className="popup-message">{popupMessage}</span>
            </div>
          </div>
        )}

        <div className="dashboard-header">
          <div>
            <h2>Welcome back, {username}!</h2>
            <p>Here's an overview of your home loan account</p>
          </div>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>

        <div className="action-buttons">
          <button
            onClick={() => setActiveView("payment")}
            className={`action-btn ${activeView === "payment" ? "active" : "secondary"}`}
          >
            Make a Payment
          </button>
          <button
            onClick={() => setActiveView("statements")}
            className={`action-btn ${activeView === "statements" ? "active" : "secondary"}`}
          >
            View Statements
          </button>
          <button
            onClick={() => setActiveView("support")}
            className={`action-btn ${activeView === "support" ? "active" : "secondary"}`}
          >
            Contact Support
          </button>
        </div>

        {activeView === "dashboard" && renderDashboardView()}
        {activeView === "payment" && renderPaymentView()}
        {activeView === "statements" && renderStatementsView()}
        {activeView === "support" && renderSupportView()}
      </div>
    </div>
  );
}

export default Dashboard;
