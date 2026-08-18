import fs from 'fs';
import path from 'path';
import type { EventProposal, ProposalLog } from '@/lib/types';

const STORE_PATH = path.join(process.cwd(), '.proposals_store.json');

const INITIAL_PROPOSALS: EventProposal[] = [
  {
    id: 'demo-prop-1',
    title: 'Hội Thảo Công Nghệ Thông Tin & AI 2026',
    created_by: 'khoacntt@ptithcm.edu.vn',
    organization_unit: 'Khoa Công Nghệ Thông Tin',
    start_date: '2026-08-25',
    start_time: '08:30',
    end_date: '2026-08-25',
    end_time: '11:30',
    start_datetime: '2026-08-25T08:30:00.000Z',
    end_datetime: '2026-08-25T11:30:00.000Z',
    participant_count: 80,
    volunteer_count: 10,
    organizer_count: 5,
    total_count: 95,
    room_id: 'room-2a08',
    room_name: 'Hội trường 2A08',
    requires_ctsv_approval: false,
    requires_facility_approval: true,
    current_stage: 'facility',
    status: 'pending',
    description: 'Chương trình hội thảo định hướng công nghệ AI và nghiên cứu khoa học dành cho sinh viên.',
    plan_url: 'https://drive.google.com/test-khoa-cntt',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const INITIAL_LOGS: ProposalLog[] = [
  {
    id: 'log-1',
    proposal_id: 'demo-prop-1',
    stage: 'facility',
    action: 'comment',
    actor_email: 'khoacntt@ptithcm.edu.vn',
    actor_name: 'Khoa Công Nghệ Thông Tin',
    notes: 'Đơn vị Khoa Công Nghệ Thông Tin nộp đơn mượn địa điểm "Hội Thảo Công Nghệ Thông Tin & AI 2026". Đã chuyển thẳng đến Phòng. TC-HC-QT phê duyệt cấp phòng: Hội trường 2A08.',
    created_at: new Date().toISOString(),
  }
];

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
