import React, { useState, useRef } from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import axios from 'axios';
import './ResumeUpload.css';

const { Dragger } = Upload;

const ResumeUpload = ({ onUploadSuccess }) => {
  const [loading, setLoading] = useState(false);

  // Prevent duplicate triggers (Strict Mode safe)
  const uploadTriggered = useRef(false);

  const customRequest = async ({ file, onSuccess, onError }) => {
    if (uploadTriggered.current) {
      console.log("Duplicate upload prevented.");
      return;
    }
    uploadTriggered.current = true; // Lock trigger

    setLoading(true);
    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await axios.post('http://localhost:5000/api/upload-resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        message.success(`${file.name} uploaded and parsed successfully.`);
        onUploadSuccess(response.data.data);
        onSuccess();
      } else {
        message.error(response.data.message || `${file.name} upload failed.`);
        onError(new Error(response.data.message));
      }
    } catch (error) {
      message.error('An error occurred during the upload.');
      onError(error);
    } finally {
      setLoading(false);
      // ❗ Optional: Reset the flag if you want to allow re-upload after a failure
      // uploadTriggered.current = false;
    }
  };

  return (
    <div className="resume-upload-container">
      <h1 className="upload-title">AI Interview Assistant</h1>
      <p className="upload-subtitle">
        Upload your resume to begin. The AI will parse your details and then start the interview.
      </p>
      <div className="dragger-container">
        <Dragger
          customRequest={customRequest}
          disabled={loading}
          showUploadList={false}
          multiple={false}
          accept=".pdf"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag file to this area to upload</p>
          <p className="ant-upload-hint">
            Support for a single PDF file. Your resume will be parsed to extract your name, email, and phone number.
          </p>
        </Dragger>
      </div>
    </div>
  );
};

export default ResumeUpload;
