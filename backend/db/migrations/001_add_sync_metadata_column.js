/**
 * Migration: 001_add_sync_metadata_column
 *
 * Adds metadata column to cloud_exam_submissions for tracking sync details
 *
 * Created: 2024
 */

module.exports = {
  /**
   * Run migration (up)
   * @param {Pool} pool - PostgreSQL connection pool
   */
  async up(pool) {
    await pool.query(`
      ALTER TABLE cloud_exam_submissions
      ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}'
    `);

    await pool.query(`
      ALTER TABLE cloud_exam_submissions
      ADD COLUMN IF NOT EXISTS last_sync_error TEXT
    `);

    console.log("[Migration] Added sync_metadata and last_sync_error columns");
  },

  /**
   * Rollback migration (down)
   * @param {Pool} pool - PostgreSQL connection pool
   */
  async down(pool) {
    await pool.query(`
      ALTER TABLE cloud_exam_submissions
      DROP COLUMN IF EXISTS sync_metadata
    `);

    await pool.query(`
      ALTER TABLE cloud_exam_submissions
      DROP COLUMN IF EXISTS last_sync_error
    `);

    console.log(
      "[Migration] Rolled back sync_metadata and last_sync_error columns",
    );
  },
};
