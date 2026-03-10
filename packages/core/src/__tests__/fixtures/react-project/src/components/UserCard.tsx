import React, { useState } from "react";
import { Button } from "./Button";
import { useAuth } from "../hooks/useAuth";

export interface UserCardProps {
  name: string;
  email: string;
}

/** Displays user information with an edit toggle */
export function UserCard({ name, email }: UserCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { user } = useAuth();

  return (
    <div className="user-card">
      <h2>{name}</h2>
      <p>{email}</p>
      {user && (
        <Button
          label={isEditing ? "Save" : "Edit"}
          onClick={() => setIsEditing(!isEditing)}
        />
      )}
    </div>
  );
}
