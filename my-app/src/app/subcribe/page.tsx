'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SubscribePage = () => {
  const router = useRouter();
  return (
    <div className="subscribe">
      <img src="https://68.media.tumblr.com/abc925865de6e5f091dc7721315db6ea/tumblr_inline_orpfllNWRK1v00f4n_540.png" alt="Subscribe" />
      <h2>Subscribe</h2>
      <form >
        <button onClick={()=>router.push('https://accounts.google.com/o/oauth2/v2/auth?client_id=367239988199-rmkv4odnep7tvn89knda50btbf0opvri.apps.googleusercontent.com&redirect_uri=http://localhost:3000/auth/callback/google&response_type=code&include_granted_scopes=true&access_type=offline&scope=https%3A//www.googleapis.com/auth/gmail.readonly')}>Subscribe</button>
      </form>
    </div>
  );
};

export default SubscribePage;
