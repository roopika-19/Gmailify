"use client";
import { SetStateAction, useEffect, useState } from "react";

const Loading = () => {
  const [userId, setUserId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      const urlParams = new URLSearchParams(new URL(url).search);
      const code = urlParams.get("code");
      console.log(code);

      fetch('http://localhost:5000/auth/google/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
        }),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
          }
          return response.json();
        })
        .then(data => {
          console.log('Success:', data);
          setUserId(data.id); // Store the user ID from the response
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
  }, []);

  const handlePhoneNumberChange = (e: { target: { value: SetStateAction<string>; }; }) => {
    setPhoneNumber(e.target.value);
  };

  const handlePhoneNumberSubmit = (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    fetch('http://localhost:5000/user/update-phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        phoneNumber: phoneNumber,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.json();
      })
      .then(data => {
        console.log('Phone number saved:', data);
      })
      .catch(error => {
        console.error('Error:', error);
      });
  };

  return (
    <div>
      <h2>Welcome! Kindly add your phone number:</h2>
      <form onSubmit={handlePhoneNumberSubmit}>
        <label htmlFor="phone-number">Phone Number:</label>
        <input
          type="text"
          id="phone-number"
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
        />
        <button type="submit">Submit</button>
      </form>
    </div>
  );
};

export default Loading;
