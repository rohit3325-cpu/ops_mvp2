import './globals.css';

export const metadata = {
  title: 'OpsFlow — Operations under control',
  description: 'A reliable workspace to own, track, and resolve operational work.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
