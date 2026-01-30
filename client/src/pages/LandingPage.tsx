import React from "react";
import { useNavigate } from "react-router-dom";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#f6f7fa]">
      <h1 className="text-[2.8rem] font-extrabold mb-10 text-[#23272f] tracking-tight">CodeX</h1>
      <div className="flex gap-8">
        <button
          className="bg-white border border-[#e0e3ea] rounded-[1.2rem] min-w-[220px] min-h-[160px] py-[2.2rem] px-[2.5rem] flex flex-col items-start justify-center cursor-pointer shadow-sm transition-all duration-150 hover:shadow-lg hover:border-[#3b82f6] focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => navigate("/teacher")}
          tabIndex={0}
        >
          <div className="text-[1.4rem] font-semibold text-[#23272f] mb-2">Teacher</div>
          <div className="text-base text-[#6b7280]">Host the session and guide students</div>
        </button>
        <button
          className="bg-white border border-[#e0e3ea] rounded-[1.2rem] min-w-[220px] min-h-[160px] py-[2.2rem] px-[2.5rem] flex flex-col items-start justify-center cursor-pointer shadow-sm transition-all duration-150 hover:shadow-lg hover:border-[#3b82f6] focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => navigate("/student")}
          tabIndex={0}
        >
          <div className="text-[1.4rem] font-semibold text-[#23272f] mb-2">Student</div>
          <div className="text-base text-[#6b7280]">Join a session to learn and collaborate</div>
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
