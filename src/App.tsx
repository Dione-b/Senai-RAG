import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pt-8 pb-14">
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
