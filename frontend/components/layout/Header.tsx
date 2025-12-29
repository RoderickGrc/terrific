import React, { useState } from 'react';
import { Moon, Sun, Edit2, Check, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface HeaderProps {
  title?: string | React.ReactNode;
  description?: string;
  onDescriptionUpdate?: (description: string) => Promise<void>;
  isDarkMode: boolean;
  toggleTheme: () => void;
  rightContent?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title = "QA Testing App", description, onDescriptionUpdate, isDarkMode, toggleTheme, rightContent }) => {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    setEditedDescription(description || '');
    setIsEditingDescription(true);
  };

  const handleCancelEdit = () => {
    setEditedDescription(description || '');
    setIsEditingDescription(false);
  };

  const handleSaveDescription = async () => {
    if (onDescriptionUpdate) {
      setIsSaving(true);
      try {
        await onDescriptionUpdate(editedDescription);
        setIsEditingDescription(false);
      } catch (error) {
        console.error('Failed to save description:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <header className="border-b border-border-light dark:border-border-dark bg-white dark:bg-black sticky top-0 z-50 transition-colors duration-300">
      <div className={`px-6 flex items-center justify-between ${description || isEditingDescription ? 'py-3' : 'h-16'}`}>
        <div className="flex-1 min-w-0">
          {typeof title === 'string' ? (
            <h1 className="text-[20px] font-semibold tracking-tight text-black dark:text-white truncate">
              {title}
            </h1>
          ) : (
            title
          )}

          {isEditingDescription ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="flex-1 text-[13px] text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-black dark:focus:border-white px-1 py-0.5"
                placeholder="Add a description..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveDescription();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
              />
              <button
                onClick={handleSaveDescription}
                disabled={isSaving}
                className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50"
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-0.5 group">
              {description ? (
                <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate flex-1">
                  {description}
                </p>
              ) : onDescriptionUpdate ? (
                <button
                  onClick={handleStartEdit}
                  className="text-[13px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Add description...
                </button>
              ) : null}
              {onDescriptionUpdate && (
                <button
                  onClick={handleStartEdit}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all rounded"
                  title="Edit description"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
          {rightContent}
          <div className="w-px h-6 bg-border-light dark:border-border-dark mx-2" />
          <Button variant="text" size="icon" onClick={toggleTheme} className="rounded-full" aria-label="Toggle Theme">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </Button>
        </div>
      </div>
    </header>
  );
};
