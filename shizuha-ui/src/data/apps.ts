/**
 * Shizuha Apps Registry
 *
 * Single source of truth for all Shizuha platform applications.
 * Used by AppSwitcher, ProductGrid, and other components that need the full apps list.
 */

import type { ShizuhaApp } from '../types'

/**
 * Extended app metadata for landing pages and marketing
 */
export interface ShizuhaAppExtended extends ShizuhaApp {
  tagline: string
  category: 'productivity' | 'collaboration' | 'finance' | 'infrastructure' | 'ai' | 'identity'
}

/**
 * All available Shizuha apps with full metadata
 */
export const SHIZUHA_APPS: ShizuhaAppExtended[] = [
  // Identity & Admin
  {
    id: 'home',
    name: 'Home',
    description: 'Dashboard',
    tagline: 'Your Shizuha command center and product launcher.',
    path: '/',
    icon: 'LayoutDashboard',
    bgColor: 'bg-amber-500',
    category: 'productivity',
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Organizations',
    tagline: 'Manage organizations, teams, and billing in one place.',
    path: '/admin/',
    icon: 'Building2',
    bgColor: 'bg-slate-600',
    category: 'identity',
  },
  {
    id: 'id',
    name: 'Account',
    description: 'Profile & Settings',
    tagline: 'Manage your identity, security, and preferences.',
    path: '/id/account',
    icon: 'UserCircle',
    bgColor: 'bg-gray-500',
    category: 'identity',
  },

  // Productivity
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Task Management',
    tagline: 'Track tasks, manage projects, and handle alerts in one place.',
    path: '/pulse/',
    icon: 'HeartPulse',
    bgColor: 'bg-indigo-500',
    category: 'productivity',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Personal Notes',
    tagline: 'Capture thoughts with a powerful rich-text editor.',
    path: '/notes/',
    icon: 'StickyNote',
    bgColor: 'bg-sky-500',
    category: 'productivity',
  },
  {
    id: 'mail',
    name: 'Mail',
    description: 'Email',
    tagline: 'Professional email with full calendar integration.',
    path: '/mail/',
    icon: 'Mail',
    bgColor: 'bg-rose-500',
    category: 'productivity',
  },
  {
    id: 'time',
    name: 'Time',
    description: 'Time Tracking',
    tagline: 'Track work hours, timesheets, and attendance.',
    path: '/time/',
    icon: 'Clock',
    bgColor: 'bg-violet-500',
    category: 'productivity',
  },

  // Collaboration
  {
    id: 'connect',
    name: 'Connect',
    description: 'Social Network',
    tagline: 'Professional networking with real-time social feeds.',
    path: '/connect/',
    icon: 'Users',
    bgColor: 'bg-blue-500',
    category: 'collaboration',
  },
  {
    id: 'wiki',
    name: 'Wiki',
    description: 'Team Docs',
    tagline: 'Build a collaborative knowledge base for your team.',
    path: '/wiki/',
    icon: 'BookOpen',
    bgColor: 'bg-emerald-500',
    category: 'collaboration',
  },
  {
    id: 'drive',
    name: 'Drive',
    description: 'File Storage',
    tagline: 'Store, share, and collaborate on files securely.',
    path: '/drive/',
    icon: 'HardDrive',
    bgColor: 'bg-cyan-500',
    category: 'collaboration',
  },

  // Finance
  {
    id: 'finance',
    name: 'Finance',
    description: 'Personal Finance',
    tagline: 'Track expenses, split bills, and manage budgets.',
    path: '/finance/',
    icon: 'Wallet',
    bgColor: 'bg-green-500',
    category: 'finance',
  },
  {
    id: 'books',
    name: 'Books',
    description: 'Accounting',
    tagline: 'Double-entry bookkeeping with GST/TDS compliance.',
    path: '/books/',
    icon: 'Calculator',
    bgColor: 'bg-teal-500',
    category: 'finance',
  },

  // Infrastructure
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Asset Mgmt',
    tagline: 'Track and manage your physical and digital assets.',
    path: '/inventory/',
    icon: 'Package',
    bgColor: 'bg-amber-500',
    category: 'infrastructure',
  },
  {
    id: 'hr',
    name: 'HR',
    description: 'Human Resources',
    tagline: 'Manage employees, payroll, and organizational structure.',
    path: '/hr/',
    icon: 'UserCog',
    bgColor: 'bg-orange-500',
    category: 'infrastructure',
  },
  {
    id: 'scs',
    name: 'Cloud',
    description: 'Infrastructure',
    tagline: 'Deploy and manage virtual machines and cloud resources.',
    path: '/scs/',
    icon: 'Cloud',
    bgColor: 'bg-purple-500',
    category: 'infrastructure',
  },

  // Finance (continued)
  {
    id: 'oracle',
    name: 'Oracle',
    description: 'Gold & Silver',
    tagline: 'AI-powered forecasting for gold and silver prices.',
    path: '/oracle/',
    icon: 'TrendingUp',
    bgColor: 'bg-yellow-500',
    category: 'finance',
  },

  // Commerce
  {
    id: 'agora',
    name: 'Agora',
    description: 'Marketplace',
    tagline: 'Buy and sell products in your organization marketplace.',
    path: '/agora/',
    icon: 'ShoppingBag',
    bgColor: 'bg-lime-500',
    category: 'finance',
  },

  // AI
  {
    id: 'hive',
    name: 'HIVE',
    description: 'Agent Control',
    tagline: 'Manage fleet agents, customer claws, and inference access.',
    path: '/hive/',
    icon: 'Bot',
    bgColor: 'bg-pink-500',
    category: 'ai',
  },
  {
    id: 'chat',
    name: 'Chat',
    description: 'AI Chat',
    tagline: 'Chat with your AI assistant powered by Claude.',
    path: '/chat/',
    icon: 'MessageCircle',
    bgColor: 'bg-fuchsia-500',
    category: 'ai',
  },
]

/**
 * Get apps for the AppSwitcher (excludes categories if needed)
 */
export function getAppSwitcherApps(): ShizuhaApp[] {
  return SHIZUHA_APPS.map(({ tagline, category, ...app }) => app)
}

/**
 * Get apps for the landing page product grid (user-facing apps only)
 */
export function getProductGridApps(): ShizuhaAppExtended[] {
  // Exclude identity apps from the main product grid (they're utility)
  return SHIZUHA_APPS.filter((app) => app.category !== 'identity')
}

/**
 * Get app by ID
 */
export function getAppById(id: string): ShizuhaAppExtended | undefined {
  return SHIZUHA_APPS.find((app) => app.id === id)
}

/**
 * Get apps by category
 */
export function getAppsByCategory(
  category: ShizuhaAppExtended['category']
): ShizuhaAppExtended[] {
  return SHIZUHA_APPS.filter((app) => app.category === category)
}
