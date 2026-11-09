import React, { useState } from 'react';
import {
  X,
  LayoutGrid,
  Code2,
  Compass,
  Sparkles,
  ExternalLink,
  Play,
  RotateCcw,
} from 'lucide-react';

export interface MarketplaceApp {
  id: string;
  name: string;
  tagline: string;
  category: 'collaboration' | 'productivity' | 'games';
  icon: 'code' | 'compass' | 'sparkles' | 'grid';
  iframeUrl: string;
  author: string;
}

export const FEATURED_MARKETPLACE_APPS: MarketplaceApp[] = [
  {
    id: 'code-sandbox',
    name: 'Live Code Sandbox',
    tagline:
      'Collaborative code runner & syntax scratchpad for developer interviews',
    category: 'productivity',
    icon: 'code',
    iframeUrl: 'about:blank',
    author: 'MeetIT Labs',
  },
  {
    id: 'diagram-canvas',
    name: 'Architecture Diagrammer',
    tagline: 'Real-time flowcharts, wireframes, and sequence diagrams',
    category: 'collaboration',
    icon: 'compass',
    iframeUrl: 'about:blank',
    author: 'Community Tools',
  },
  {
    id: 'scrum-poker',
    name: 'Sprint Planning Poker',
    tagline:
      'Consensus-based story point estimation with hidden cards and countdowns',
    category: 'productivity',
    icon: 'grid',
    iframeUrl: 'about:blank',
    author: 'Agile Collective',
  },
  {
    id: 'icebreaker-spin',
    name: 'Team Icebreakers',
    tagline: 'Casual prompt cards and trivia wheels for team bonding',
    category: 'games',
    icon: 'sparkles',
    iframeUrl: 'about:blank',
    author: 'FunWorks',
  },
];

interface AppsMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAppId?: string | null;
  onLaunchApp: (app: MarketplaceApp) => void;
  onCloseActiveApp?: () => void;
}

export function AppsMarketplaceModal({
  isOpen,
  onClose,
  activeAppId,
  onLaunchApp,
  onCloseActiveApp,
}: AppsMarketplaceModalProps) {
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'collaboration' | 'productivity' | 'games'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredApps = FEATURED_MARKETPLACE_APPS.filter((app) => {
    const matchesCat =
      activeCategory === 'all' || app.category === activeCategory;
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.tagline.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const renderIcon = (iconType: MarketplaceApp['icon']) => {
    switch (iconType) {
      case 'code':
        return <Code2 size={20} style={{ color: '#3b82f6' }} />;
      case 'compass':
        return <Compass size={20} style={{ color: '#10b981' }} />;
      case 'sparkles':
        return <Sparkles size={20} style={{ color: '#eab308' }} />;
      default:
        return <LayoutGrid size={20} style={{ color: 'var(--accent)' }} />;
    }
  };

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apps-modal-title"
      data-testid="apps-marketplace-modal"
    >
      <div
        className="shortcuts-modal-card"
        style={{
          maxWidth: 640,
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutGrid size={20} style={{ color: 'var(--accent)' }} />
            <h3
              id="apps-modal-title"
              style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}
            >
              In-Meeting Apps Marketplace
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close apps marketplace"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Categories Bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '14px',
          }}
        >
          <input
            type="text"
            placeholder="Search apps and tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="panel-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            data-testid="apps-search-input"
          />

          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'collaboration', 'productivity', 'games'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`btn btn-sm ${activeCategory === cat ? 'primary' : 'secondary'}`}
                  style={{
                    textTransform: 'capitalize',
                    padding: '4px 10px',
                    fontSize: '12px',
                  }}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ),
            )}
          </div>
        </div>

        {/* App Cards List */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
            marginTop: '16px',
            overflowY: 'auto',
            paddingRight: '4px',
            flex: 1,
          }}
        >
          {filteredApps.map((app) => {
            const isCurrentlyActive = activeAppId === app.id;
            return (
              <div
                key={app.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '12px',
                  border: `1px solid ${isCurrentlyActive ? 'var(--accent)' : 'var(--line)'}`,
                  background: isCurrentlyActive
                    ? 'var(--soft)'
                    : 'var(--surface)',
                  gap: '12px',
                }}
                data-testid={`app-card-${app.id}`}
              >
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {renderIcon(app.icon)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: 'var(--ink)',
                      }}
                    >
                      {app.name}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        marginTop: '2px',
                      }}
                    >
                      {app.tagline}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--line)',
                    paddingTop: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    By {app.author}
                  </span>

                  {isCurrentlyActive ? (
                    <button
                      type="button"
                      className="btn btn-sm danger"
                      style={{ padding: '4px 10px', fontSize: '11.5px' }}
                      onClick={onCloseActiveApp}
                    >
                      <RotateCcw size={12} style={{ marginRight: 4 }} />
                      Close App
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm primary"
                      style={{ padding: '4px 10px', fontSize: '11.5px' }}
                      onClick={() => {
                        onLaunchApp(app);
                        onClose();
                      }}
                    >
                      <Play size={12} style={{ marginRight: 4 }} />
                      Launch
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
