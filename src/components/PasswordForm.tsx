"use client"

import { useRouter } from 'next/navigation'
import { useState } from "react";
import { useToast } from "@/components/ToastContext";

export default function PasswordForm() {
    const [password, setPassword] = useState('');
    const router = useRouter();
    const { showToast } = useToast();
    
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
  
      try {
        const response = await fetch('/api/unlock', {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({password})
        });

        if (!response.ok) {
            throw new Error('Password incorrect');
        }

        router.push('/');
      } catch (error) {
        console.error(error);
        showToast('Incorrect password. Please try again.', 'danger', 'Access Denied');
      }
    }

    return (
        <form onSubmit={handleSubmit}>
            <label>
            Password:
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <br />
            <button type="submit">Enter</button>
        </form>
    );
}
