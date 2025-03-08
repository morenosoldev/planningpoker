import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Velkommen, {user?.username}!</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Opret nyt rum</h2>
          <p className="text-gray-600 mb-4">
            Start et nyt planning poker rum og inviter dit team til at deltage i estimeringen.
          </p>
          <Link
            to="/rooms/create"
            className="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Opret rum
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Tilslut til rum</h2>
          <p className="text-gray-600 mb-4">
            Deltag i et eksisterende planning poker rum ved at indtaste invitationskoden.
          </p>
          <Link
            to="/rooms/join"
            className="inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Tilslut til rum
          </Link>
        </div>
      </div>

      {/* TODO: Tilføj liste over aktive rum */}
    </div>
  );
};

export default Dashboard; 