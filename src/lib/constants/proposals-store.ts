import fs from 'fs';
import path from 'path';
import type { EventProposal, ProposalLog } from '@/lib/types';
import { writeJsonFileAtomic, parseJsonWithRepair } from '@/lib/utils/atomic-file';

const STORE_PATH = path.join(process.cwd(), '.proposals_store.json');
const READ_TTL_MS = 5000;

const INITIAL_PROPOSALS: EventProposal[] = [];
const INITIAL_LOGS: ProposalLog[] = [];

interface ProposalStoreData {
  proposals: EventProposal[];
  logs: ProposalLog[];
}

let inMemoryData: ProposalStoreData | null = null;
let lastReadTs = 0;

function loadStore(): ProposalStoreData {
  const now = Date.now();
  if (inMemoryData && now - lastReadTs < READ_TTL_MS) {
    return inMemoryData;
  }
  try {
    if (fs.existsSync(STORE_PATH)) {
      const content = fs.readFileSync(STORE_PATH, 'utf8');
      const res = parseJsonWithRepair<ProposalStoreData>(content);
      if (res?.value && Array.isArray(res.value.proposals)) {
        inMemoryData = {
          proposals: res.value.proposals,
          logs: Array.isArray(res.value.logs) ? res.value.logs : [],
        };
        lastReadTs = now;
        if (res.repaired) {
          saveStore(inMemoryData);
        }
        return inMemoryData;
      }
    }
  } catch (e) {
    console.warn('Failed to load .proposals_store.json, using fallback:', e);
  }
  if (inMemoryData) return inMemoryData;
  inMemoryData = { proposals: INITIAL_PROPOSALS, logs: INITIAL_LOGS };
  lastReadTs = now;
  saveStore(inMemoryData);
  return inMemoryData;
}

function saveStore(data: ProposalStoreData) {
  inMemoryData = data;
  lastReadTs = Date.now();
  writeJsonFileAtomic(STORE_PATH, data).catch(() => {});
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
  // Also clean up orphaned logs for this proposal
  store.logs = store.logs.filter(l => l.proposal_id !== id);
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
  // Keep only the most recent 500 logs to prevent unbounded memory growth
  if (store.logs.length > 500) {
    store.logs = store.logs.slice(-500);
  }
  saveStore(store);
  return newLog;
}
