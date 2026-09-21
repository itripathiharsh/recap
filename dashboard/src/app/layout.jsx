import './globals.css';
import AppShell from '../components/AppShell';

export const metadata = {
  title: 'recap — Turn your meetings into meaningful progress',
  description: 'recap automatically records, transcribes, and summarizes your Google Meet sessions so you can focus on conversations.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

