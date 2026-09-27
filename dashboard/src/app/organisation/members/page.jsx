'use client';

import React from 'react';
import OrganisationPage from '../../../components/OrganisationPage';
import TopHeader from '../../../components/TopHeader';
import MembersAccessPanel from '../../../components/MembersAccessPanel';

export default function OrganisationMembersPage() {
  return (
    <>
      <TopHeader placeholder="Search meetings, people, teams, or insights..." />

      <OrganisationPage chrome={false}>
        <MembersAccessPanel variant="page" />
      </OrganisationPage>
    </>
  );
}
