import React from 'react';
import { UserOutlined, DashboardOutlined } from '@ant-design/icons';
import './RoleSelectionPage.css';

const RoleSelectionPage = ({ onRoleSelect }) => {
  return (
    <div className="role-selection-background">
      <div className="role-selection-container">
        <h1 className="main-title">Welcome to the AI Interview Assistant</h1>
        <p className="main-subtitle">Please select your role to continue</p>
        <div className="role-cards-wrapper">
          {/* Candidate Card */}
          <div className="role-card" onClick={() => onRoleSelect('candidate')}>
            <div className="card-icon-wrapper">
              <UserOutlined className="card-icon" />
            </div>
            <h2 className="card-title">Candidate</h2>
            <p className="card-description">Start your automated screening interview.</p>
          </div>

          {/* Interviewer Card */}
          <div className="role-card" onClick={() => onRoleSelect('interviewer')}>
            <div className="card-icon-wrapper">
              <DashboardOutlined className="card-icon" />
            </div>
            <h2 className="card-title">Interviewer</h2>
            <p className="card-description">View candidate results and analytics.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelectionPage;
