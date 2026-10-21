import { Provider } from "./base.js";

/**
 * Official Blackbaud SKY API provider — the drop-in replacement once each
 * school's Blackbaud environment admin connects your registered application.
 *
 * Plan (per https://developer.blackbaud.com/skyapi/):
 *  - Register a free developer account + application; note the Application ID,
 *    OAuth client id/secret, and your subscription key.
 *  - Each school's Marketplace/environment admin connects the app by
 *    Application ID (no Marketplace listing required).
 *  - OAuth 2.0 authorization-code flow as the PARENT, once per school
 *    environment; store the refresh token per school.
 *  - Endpoints (Education Management "School" API):
 *      GET /school/v1/users/me                      → your user + children
 *      GET /school/v1/academics/{student_id}/assignments?start_date=&end_date=
 *      GET /school/v1/academics/enrollments/{student_id} (+ grades endpoints)
 *    Assignment access requires the Parent relationship with parental access
 *    enabled on the child's record — which you have.
 *
 * Config addition when ready:
 *   { "skyApi": { "clientId": "...", "subscriptionKey": "...", ... } }
 * Secrets should live in environment variables, not config.json.
 */
export class SkyApiProvider extends Provider {
  async listStudents() {
    throw new Error(
      "SKY API provider not implemented yet — waiting on school admin app connections."
    );
  }
  async getAssignments() {
    throw new Error("SKY API provider not implemented yet.");
  }
  async getGrades() {
    throw new Error("SKY API provider not implemented yet.");
  }
}
