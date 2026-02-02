import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const commonConfig = {
  showProgress: true,
  allowClose: true,
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
};

/** FTUX tour for Super Admin on Platform Admin page */
export function runPlatformTour(): void {
  const steps: DriveStep[] = [
    {
      element: 'body',
      popover: {
        title: 'Welcome to Platform Admin',
        description: 'This short tour will show you the main areas: onboarding guide, creating tenants, and the tenant list.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="platform-onboarding-guide"]',
      popover: {
        title: 'Onboarding guide',
        description: 'Open the full application guide (tenant & user onboarding, features). You can print or save it as PDF.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="platform-create-tenant"]',
      popover: {
        title: 'Create Tenant',
        description: 'Add a new gym (tenant). Enter business name, optional slug/subdomain, and admin email & password. Share the credentials with the gym owner.',
        side: 'bottom',
      },
    },
    {
      element: '[data-tour="platform-tenants-table"]',
      popover: {
        title: 'Tenants list',
        description: 'All your tenants (gyms). Click a row to see details, reset admin password, or mark enquiry as new.',
        side: 'top',
      },
    },
    {
      element: '[data-tour="platform-go-dashboard"]',
      popover: {
        title: 'Go to Dashboard',
        description: 'Switch to the tenant dashboard (members, enquiries, attendance, finance).',
        side: 'left',
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Tour complete',
        description: 'You can start this tour again anytime using the "Take a tour" button.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  const driverObj = driver({
    ...commonConfig,
    steps,
  });
  driverObj.drive();
}

/** FTUX tour for tenant users on Dashboard (sidebar + main areas) */
export function runDashboardTour(): void {
  const steps: DriveStep[] = [
    {
      element: 'body',
      popover: {
        title: 'Dashboard tour',
        description: 'This tour will show you the main sections: People, Add Member, Enquiry Members, Attendance, Finance, and theme.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: 'Dashboard',
        description: 'Overview: total members, active members, fees collected, pending fees, and monthly reports. Download PDF from here.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-main"]',
      popover: {
        title: 'People',
        description: 'All gym members. Search, filter by gender/status, add members, pay fees, and add follow-ups. Click a row for details.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-add"]',
      popover: {
        title: 'Add Member',
        description: 'Register a new member: name, phone, gender, package, join date, and payment.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-enquiries"]',
      popover: {
        title: 'Enquiry Members',
        description: 'People who enquired but haven’t joined. Add enquiries, follow up, convert to member, or mark as lost.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-checkin"]',
      popover: {
        title: 'Attendance',
        description: 'Check-in: enter registration number to record today’s attendance.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="nav-finance"]',
      popover: {
        title: 'Finance',
        description: 'Finance summary and monthly collection details. Download PDF reports.',
        side: 'right',
      },
    },
    {
      element: '[data-tour="theme-toggle"]',
      popover: {
        title: 'Theme',
        description: 'Switch between light and dark mode.',
        side: 'right',
      },
    },
    {
      element: 'body',
      popover: {
        title: 'Tour complete',
        description: 'You can replay this tour anytime using the "Guide" button in the sidebar.',
        side: 'bottom',
        align: 'center',
      },
    },
  ];

  const driverObj = driver({
    ...commonConfig,
    steps,
  });
  driverObj.drive();
}
