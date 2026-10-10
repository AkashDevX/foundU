import {
  daysUntilIso,
  documentsStillNeedingRenewal,
  dueRenewalsFromProfile,
  reminderCopy,
  renewalsForProfile,
} from '../src/utils/documentRenewal';
import type { UserProfileSnapshot } from '../src/types/userProfile';

const today = new Date(2026, 9, 10);

describe('document renewal window', () => {
  it('counts calendar days until an ISO expiry', () => {
    expect(daysUntilIso('2026-11-09', today)).toBe(30);
    expect(daysUntilIso('2026-11-10', today)).toBe(31);
    expect(daysUntilIso('2026-10-01', today)).toBe(-9);
    expect(daysUntilIso('2026-10-10', today)).toBe(0);
  });

  it('includes certificates, checks, licences, and permits inside 30 days or already expired', () => {
    const profile: UserProfileSnapshot = {
      visaStatus: 'Temporary visa',
      visaExpiry: '2026-11-09',
      policeCheckExpiry: '2026-10-01',
      fitToWorkExpiry: '2026-11-10',
      vehicleExpiry: '2026-10-10',
      licencesJson: [
        { id: '7', type: 'Forklift', expiry: '2026-10-20', imageUploaded: true },
        { id: '8', type: 'HR', expiry: '2027-01-01', imageUploaded: true },
      ],
      insurancesJson: [
        { id: 'pl', type: 'Public liability', expiry: '2026-10-25', imageUploaded: true },
      ],
    };

    expect(dueRenewalsFromProfile(profile, today).map((item) => item.key)).toEqual([
      'visa',
      'police_check',
      'vehicle_registration',
      'licence:7',
      'insurance:pl',
    ]);
    expect(dueRenewalsFromProfile(profile, today)[1]).toMatchObject({
      status: 'expired',
      daysUntil: -9,
    });
  });

  it('ignores a citizen visa expiry', () => {
    expect(
      dueRenewalsFromProfile({ visaStatus: 'Australian citizen', visaExpiry: '2026-10-20' }, today),
    ).toEqual([]);
  });

  it('prefers the server list when the profile includes it', () => {
    const profile: UserProfileSnapshot = {
      policeCheckExpiry: '2026-10-20',
      documentRenewals: [
        {
          key: 'police_check',
          label: 'Police check',
          expiry: '2026-10-20',
          daysUntil: 10,
          status: 'expiring',
        },
      ],
    };
    expect(renewalsForProfile(profile, today)).toHaveLength(1);
    expect(renewalsForProfile({ ...profile, documentRenewals: [] }, today)).toEqual([]);
  });

  it('writes a daily reminder until the renewed document is uploaded', () => {
    const one = reminderCopy([
      {
        key: 'police_check',
        label: 'Police check',
        expiry: '2026-10-20',
        daysUntil: 10,
        status: 'expiring',
      },
    ]);
    expect(one.title).toBe('Your Police check expires in 10 days');
    expect(one.body).toContain('Your Police check expires in 10 days. Please renew it.');
    expect(one.body).toContain('until you submit it');

    const many = reminderCopy([
      { key: 'a', label: 'Police check', expiry: '2026-10-20', daysUntil: 10, status: 'expiring' },
      { key: 'b', label: 'Forklift', expiry: '2026-10-21', daysUntil: 11, status: 'expiring' },
      { key: 'c', label: 'Visa', expiry: '2026-10-22', daysUntil: 12, status: 'expiring' },
      { key: 'd', label: 'White card', expiry: '2026-10-23', daysUntil: 13, status: 'expiring' },
    ]);
    expect(many.title).toBe('Documents need renewing');
    expect(many.body).toContain('Your Police check expires in 10 days. Please renew it.');
    expect(many.body).toContain('Your White card expires in 13 days. Please renew it.');
  });

  it('counts down one day at a time from 30 days', () => {
    const at = (daysUntil: number) =>
      reminderCopy([
        {
          key: 'police_check',
          label: 'Police check',
          expiry: '2026-11-09',
          daysUntil,
          status: daysUntil < 0 ? 'expired' : 'expiring',
        },
      ]);
    expect(at(30).title).toBe('Your Police check expires in 30 days');
    expect(at(29).body).toContain('expires in 29 days');
    expect(at(1).title).toBe('Your Police check expires in 1 day');
    expect(at(0).title).toBe('Your Police check expires today');
    expect(at(-1).body).toContain('expired 1 day ago');
  });

  it('says a document is expired and drops it after a proper renewal', () => {
    const expired = reminderCopy([
      {
        key: 'police_check',
        label: 'Police check',
        expiry: '2026-09-12',
        daysUntil: -28,
        status: 'expired',
      },
    ]);
    expect(expired.title).toBe('Your Police check expired 28 days ago');
    expect(expired.body).toContain('Your Police check expired 28 days ago. Please renew it.');

    const renewed = documentsStillNeedingRenewal(
      [
        {
          key: 'police_check',
          label: 'Police check',
          expiry: '2027-09-12',
          daysUntil: -28,
          status: 'expired',
        },
        {
          key: 'fit_to_work',
          label: 'Fit to work',
          expiry: '2026-09-06',
          daysUntil: -34,
          status: 'expired',
        },
      ],
      today,
    );
    expect(renewed.map((item) => item.key)).toEqual(['fit_to_work']);
    expect(renewed[0].status).toBe('expired');
  });
});
