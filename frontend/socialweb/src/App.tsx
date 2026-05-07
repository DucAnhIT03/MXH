/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserProvider } from './features/auth/context/UserContext';
import Layout from './components/shared/Layout';
import Home from './features/home/components/Home';
import Explore from './features/explore/components/Explore';
import Messages from './features/chats/components/Messages';
import Friends from './features/friends/components/Friends';
import Profile from './features/profile/components/Profile';
import Notifications from './features/notifications';
import VideoCall from './features/calls/components/VideoCall';
import AudioCall from './features/calls/components/AudioCall';
import GlobalIncomingCallOverlay from './features/calls/components/GlobalIncomingCallOverlay';
import VideoPlayer from './features/videos';
import Settings from './features/settings/components/Settings';
import Login from './features/auth/components/Login';
import Register from './features/auth/components/Register';
import ForgotPassword from './features/auth/components/ForgotPassword';

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <GlobalIncomingCallOverlay />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="explore" element={<Explore />} />
            <Route path="messages" element={<Messages />} />
            <Route path="friends" element={<Friends />} />
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="video" element={<VideoPlayer />} />
            <Route path="video/:id" element={<VideoPlayer />} />
            <Route path="settings" element={<Settings />} />
            <Route path="more" element={<div className="text-white p-6">More Page</div>} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/video-call" element={<VideoCall />} />
          <Route path="/audio-call" element={<AudioCall />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

