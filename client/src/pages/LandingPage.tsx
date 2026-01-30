import React from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  onSelectRole: (role: "teacher" | "student") => void;
};

export default function LandingPage({ onSelectRole }: Props) {
  const nav = useNavigate();

  const handleTeacherClick = () => {
    onSelectRole("teacher");
    nav("/teacher");
  }
 

  
  const handleStudentClick = () => {
    onSelectRole("student");
    nav("/student");
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="max-w-md w-full text-center bg-white shadow-lg rounded-xl p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to CodeX</h1>
        <p className="text-sm text-gray-500 mb-6">Choose a role to start or join a session.</p>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            onClick={handleTeacherClick}
          >
            I'm the Teacher
          </button>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            onClick={handleStudentClick}
          >
            I'm a Student
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-4">No account needed — sessions are created in the next step.</p>
      </div>
    </div>
  );
}
