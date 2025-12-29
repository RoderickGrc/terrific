import React from 'react';

interface MainLayoutProps {
  header: React.ReactNode;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ header, children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black transition-colors duration-300">
      {header}
      <main className="flex-1 p-6 md:p-10 max-w-[1200px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
};
