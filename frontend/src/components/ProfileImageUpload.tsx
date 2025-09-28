import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface ProfileImageUploadProps {
  onImageUpdated: (newImageUrl: string) => void;
}

const ProfileImageUpload: React.FC<ProfileImageUploadProps> = ({
  onImageUpdated,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const { token, user, guestUser } = useAuth();
  const isGuest = !!guestUser && !user;

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Tjek filtype
    if (!file.type.startsWith("image/")) {
      alert("Venligst vælg en billedfil");
      return;
    }

    // Tjek filstørrelse (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Filen er for stor. Maksimal størrelse er 5MB");
      return;
    }

    setIsUploading(true);

    try {
      if (isGuest) {
        // For guests, upload to guest endpoint (no auth required)
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(
          `${
            import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
          }/guest/profile-image/${guestUser?.id}`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error("Kunne ikke uploade billede");
        }

        const data = await response.json();
        onImageUpdated(data.profile_image);
        setIsUploading(false);
      } else {
        // For authenticated users, upload to server
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(
          `${
            import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
          }/users/profile-image`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error("Kunne ikke uploade billede");
        }

        const data = await response.json();
        onImageUpdated(data.profile_image);
        setIsUploading(false);
      }
    } catch (error) {
      console.error("Fejl ved upload:", error);
      alert("Der skete en fejl ved upload af billedet");
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <label className="cursor-pointer border border-gray-300 text-purple-500 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium">
        {isUploading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Uploader...
          </span>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Vælg profilbillede
          </>
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
