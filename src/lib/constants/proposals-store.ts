import fs from 'fs';
import path from 'path';
import type { EventProposal, ProposalLog } from '@/lib/types';

const STORE_PATH = path.join(process.cwd(), '.proposals_store.json');

const INITIAL_PROPOSALS: EventProposal[] = [];
const INITIAL_LOGS: ProposalLog[] = [];

interface ProposalStoreData {
  proposals: EventProposal[];
  logs: ProposalLog[];
}

let inMemoryData: ProposalStoreData | null = null;

function loadStore(): ProposalStoreData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const content = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.proposals)) {
        inMemoryData = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load .proposals_store.json, using fallback:', e);
  }
  if (inMemoryData) return inMemoryData;
  inMemoryData = { proposals: INITIAL_PROPOSALS, logs: INITIAL_LOGS };
  saveStore(inMemoryData);
  return inMemoryData;
}

function saveStore(data: ProposalStoreData) {
  inMemoryData = data;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write .proposals_store.json:', e);
  }
}

export function getStoredProposals(): EventProposal[] {
  return loadStore().proposals;
}

export function getStoredProposalById(id: string): EventProposal | undefined {
  return loadStore().proposals.find(p => p.id === id);
}

export function saveProposalToStore(proposal: EventProposal): EventProposal {
  const store = loadStore();
  const existingIdx = store.proposals.findIndex(p => p.id === proposal.id);
  if (existingIdx >= 0) {
    store.proposals[existingIdx] = { ...store.proposals[existingIdx], ...proposal, updated_at: new Date().toISOString() };
  } else {
    store.proposals.unshift(proposal);
  }
  saveStore(store);
  return proposal;
}

export function deleteProposalFromStore(id: string): boolean {
  const store = loadStore();
  const beforeLen = store.proposals.length;
  store.proposals = store.proposals.filter(p => p.id !== id);
  saveStore(store);
  return store.proposals.length < beforeLen;
}

export function getStoredProposalLogs(proposalId: string): ProposalLog[] {
  return loadStore().logs.filter(l => l.proposal_id === proposalId);
}

export function addStoredProposalLog(log: Omit<ProposalLog, 'id' | 'created_at'>): ProposalLog {
  const store = loadStore();
  const newLog: ProposalLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
  };
  store.logs.push(newLog);
  saveStore(store);
  return newLog;
}
