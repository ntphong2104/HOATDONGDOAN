import { DELETE } from '@/app/api/admin/graduated-cohorts/route';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import {
  GRADUATED_COHORTS_SETTING_KEY,
  LCD_DEFINITIONS,
  invalidateGraduatedCohortsCache,
  type GraduatedCohortRule,
} from '@/lib/utils/graduated-cohorts';

jest.mock('@/lib/supabase/auth-helper');
jest.mock('@/lib/supabase/server');

function buildSupabaseMock(options: {
  rules: GraduatedCohortRule[];
  deletedCohorts?: string[];
  usersRows?: Array<{ mssv: string; class_id: string; email?: string }>;
}) {
  const { rules, deletedCohorts = [], usersRows = [] } = options;
  const usersDeleteIn = jest.fn().mockResolvedValue({ error: null });
  const delegatesDeleteIn = jest.fn().mockResolvedValue({ error: null });
  const pushDeleteIn = jest.fn().mockResolvedValue({ error: null });
  const systemUpsert = jest.fn().mockResolvedValue({ error: null });

  const from = jest.fn((table: string) => {
    if (table === 'system_settings') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                key: GRADUATED_COHORTS_SETTING_KEY,
                value: JSON.stringify({
                  rules,
                  deleted_cohorts: deletedCohorts,
                }),
              },
              error: null,
            }),
          }),
        }),
        upsert: systemUpsert,
      };
    }

    if (table === 'users') {
      return {
        select: jest.fn().mockReturnValue({
          or: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn().mockResolvedValue({
                data: usersRows,
                error: null,
              }),
            }),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          in: usersDeleteIn,
        }),
      };
    }

    if (table === 'check_ins' || table === 'event_registrations' || table === 'user_penalties') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      };
    }

    if (table === 'class_delegates') {
      return {
        delete: jest.fn().mockReturnValue({
          in: delegatesDeleteIn,
        }),
      };
    }

    if (table === 'push_subscriptions') {
      return {
        delete: jest.fn().mockReturnValue({
          in: pushDeleteIn,
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from },
    spies: {
      usersDeleteIn,
      delegatesDeleteIn,
      pushDeleteIn,
      systemUpsert,
    },
  };
}

describe('DELETE /api/admin/graduated-cohorts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateGraduatedCohortsCache();
    (getAuthContext as jest.Mock).mockResolvedValue({
      email: 'superadmin@ptithcm.edu.vn',
      isSuperAdmin: true,
      tier: 'super_admin',
    });
  });

  it('rejects deleting a cohort when only partial LCDs (3/8) are marked graduated even with valid confirm', async () => {
    const partialRules: GraduatedCohortRule[] = [
      { lcd_code: 'LCD_QTKD', cohort: 'D22' },
      { lcd_code: 'LCD_KT', cohort: 'D22' },
      { lcd_code: 'LCD_MKT', cohort: 'D22' },
    ];
    const { supabase, spies } = buildSupabaseMock({ rules: partialRules });
    (createAdminClient as jest.Mock).mockResolvedValue(supabase);
    (createClient as jest.Mock).mockResolvedValue(supabase);

    const req = new Request(
      'http://localhost:3000/api/admin/graduated-cohorts?cohort=D22&confirm=XOA%20D22',
      { method: 'DELETE' }
    );

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain(`3/${LCD_DEFINITIONS.length}`);
    expect(spies.usersDeleteIn).not.toHaveBeenCalled();
    expect(spies.systemUpsert).not.toHaveBeenCalled();
  });

  it('rejects deleting a fully graduated cohort (8/8) when confirm is missing or invalid', async () => {
    const fullRules: GraduatedCohortRule[] = LCD_DEFINITIONS.map((lcd) => ({
      lcd_code: lcd.code,
      cohort: 'D22',
    }));
    const { supabase, spies } = buildSupabaseMock({ rules: fullRules });
    (createAdminClient as jest.Mock).mockResolvedValue(supabase);
    (createClient as jest.Mock).mockResolvedValue(supabase);

    // 1. Missing confirm
    const reqMissing = new Request('http://localhost:3000/api/admin/graduated-cohorts?cohort=D22', {
      method: 'DELETE',
    });
    const resMissing = await DELETE(reqMissing);
    expect(resMissing.status).toBe(400);
    const jsonMissing = await resMissing.json();
    expect(jsonMissing.success).toBe(false);
    expect(jsonMissing.error).toContain('XOA D22');

    // 2. Wrong confirm phrase (e.g. just "D22")
    const reqWrong = new Request(
      'http://localhost:3000/api/admin/graduated-cohorts?cohort=D22&confirm=D22',
      { method: 'DELETE' }
    );
    const resWrong = await DELETE(reqWrong);
    expect(resWrong.status).toBe(400);
    const jsonWrong = await resWrong.json();
    expect(jsonWrong.success).toBe(false);
    expect(jsonWrong.error).toContain('XOA D22');

    expect(spies.usersDeleteIn).not.toHaveBeenCalled();
    expect(spies.systemUpsert).not.toHaveBeenCalled();
  });

  it('deletes cohort successfully when all 8/8 LCDs are graduated and confirm=XOA D22 matches', async () => {
    const fullRules: GraduatedCohortRule[] = LCD_DEFINITIONS.map((lcd) => ({
      lcd_code: lcd.code,
      cohort: 'D22',
    }));
    const { supabase, spies } = buildSupabaseMock({
      rules: fullRules,
      usersRows: [
        { mssv: 'N22DCCN001', class_id: 'D22CQCN01-N', email: 'n22dccn001@student.ptithcm.edu.vn' },
        { mssv: 'N22DCQT015', class_id: 'D22CQQT01-N', email: 'n22dcqt015@student.ptithcm.edu.vn' },
      ],
    });
    (createAdminClient as jest.Mock).mockResolvedValue(supabase);
    (createClient as jest.Mock).mockResolvedValue(supabase);

    const req = new Request(
      'http://localhost:3000/api/admin/graduated-cohorts?cohort=D22&confirm=xoa%20%20d22',
      { method: 'DELETE' }
    );

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.deleted_cohorts).toContain('D22');
    expect(json.data.deleted_db_count).toBe(2);
    expect(spies.usersDeleteIn).toHaveBeenCalledWith('mssv', ['N22DCCN001', 'N22DCQT015']);
    expect(spies.delegatesDeleteIn).toHaveBeenCalledWith('mssv', ['N22DCCN001', 'N22DCQT015']);
    expect(spies.pushDeleteIn).toHaveBeenCalledWith('mssv', ['N22DCCN001', 'N22DCQT015']);
    expect(spies.systemUpsert).toHaveBeenCalledTimes(1);
  });
});
