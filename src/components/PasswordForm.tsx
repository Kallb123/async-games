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
        <form onSubmit={handleSubmit} className="ag-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
                <label htmlFor="access-password" className="ag-section-label" style={{ display: "block", marginBottom: 8 }}>Access password</label>
                <input
                    id="access-password"
                    className="ag-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                />
            </div>
            <button type="submit" className="ag-btn ag-btn--primary ag-btn--block">Unlock</button>
        </form>
    );
}
