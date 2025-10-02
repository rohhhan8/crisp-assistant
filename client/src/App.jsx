import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Layout, Tabs, Modal, Button, message } from 'antd';
import IntervieweePage from './pages/IntervieweePage';
import InterviewerPage from './pages/InterviewerPage';
import RoleSelectionPage from './pages/RoleSelectionPage';
import { resetInterview } from './features/interviewSlice';
import './App.css';

const { Header, Content } = Layout;

const App = () => {
  console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
  const dispatch = useDispatch();
  const [activeView, setActiveView] = useState('welcome');
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Get interview status and error from Redux state
  const { status, error } = useSelector((state) => state.interview);

  // Check for in-progress interview or errors when the app loads
  useEffect(() => {
    if (error) {
      message.error('An error occurred in your previous session. Starting a new interview.');
      dispatch(resetInterview());
    } else if (status === 'in_progress') {
      setIsModalVisible(true);
    }
  }, []); // Run only once on mount

  const handleRoleSelect = (role) => {
    if (role === 'candidate') {
      setActiveView('1');
    } else {
      setActiveView('2');
    }
  };

  const handleResume = () => {
    setIsModalVisible(false);
  };

  const handleStartOver = () => {
    dispatch(resetInterview());
    setIsModalVisible(false);
  };

  const tabItems = [
    {
      key: '1',
      label: `Interviewee`,
      children: <IntervieweePage />,
    },
    {
      key: '2',
      label: `Interviewer`,
      children: <InterviewerPage />,
    },
  ];

  if (activeView === 'welcome') {
    return <RoleSelectionPage onRoleSelect={handleRoleSelect} />;
  }

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <h1 className="header-title">AI Interview Assistant</h1>
      </Header>
      <Content className="app-content">
        <div className="site-layout-content">
          <Tabs 
            activeKey={activeView} 
            onChange={setActiveView} 
            items={tabItems}
          />
        </div>
      </Content>
      <Modal
        title="Welcome Back!"
        open={isModalVisible}
        closable={false}
        footer={[
          <Button key="resume" type="primary" onClick={handleResume}>
            Resume
          </Button>,
          <Button key="startOver" onClick={handleStartOver}>
            Start Over
          </Button>,
        ]}
      >
        <p>You have an interview in progress. Would you like to continue where you left off?</p>
      </Modal>
    </Layout>
  );
};

export default App;
