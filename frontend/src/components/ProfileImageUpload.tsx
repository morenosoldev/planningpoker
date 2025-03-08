import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProfileImageUploadProps {
  onImageUpdated: (newImageUrl: string) => void;
}

const ProfileImageUpload: React.FC<ProfileImageUploadProps> = ({ onImageUpdated }) => {
  const [isUploading, setIsUploading] = useState(false);
  const { token } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Tjek filtype
    if (!file.type.startsWith('image/')) {
      alert('Venligst vælg en billedfil');
      return;
    }

    // Tjek filstørrelse (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Filen er for stor. Maksimal størrelse er 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('http://localhost:8080/users/profile-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Kunne ikke uploade billede');
      }

      const data = await response.json();
      onImageUpdated(data.profile_image);
    } catch (error) {
      console.error('Fejl ved upload:', error);
      alert('Der skete en fejl ved upload af billedet');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <label className="cursor-pointer bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors">
        {isUploading ? (
          <span className="flex items-center">
            <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Uploader...
          </span>
        ) : (
          'Vælg profilbillede'
        )}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </label>
    </div>
  );
};

export default ProfileImageUpload; 