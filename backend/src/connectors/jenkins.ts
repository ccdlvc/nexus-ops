import axios, { AxiosInstance } from 'axios';
import { BuildResult, TestReport, SlowTest } from '../../../shared/types';
import { logger } from '../utils/logger';

export class JenkinsConnector {
  private client: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly token: string,
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      auth: { username, password: token },
      timeout: 15_000,
    });
  }

  /** List recent builds for a job */
  async getBuilds(jobName: string, limit = 10): Promise<BuildResult[]> {
    try {
      const encodedJob = jobName.split('/').map(encodeURIComponent).join('/job/');
      const { data } = await this.client.get(
        `/job/${encodedJob}/api/json?tree=builds[number,result,timestamp,duration,url,changeSets[items[commitId,author[fullName]]]]{0,${limit}}`
      );
      return (data.builds ?? []).map((b: Record<string, unknown>) => this.mapBuild(b, jobName));
    } catch (err) {
      logger.error(`Jenkins getBuilds failed for ${jobName}`, { err });
      return [];
    }
  }

  /** Get a single build with full details + console log */
  async getBuildDetail(jobName: string, buildNumber: number): Promise<BuildResult | null> {
    try {
      const encodedJob = jobName.split('/').map(encodeURIComponent).join('/job/');
      const [{ data: build }, logs] = await Promise.all([
        this.client.get(`/job/${encodedJob}/${buildNumber}/api/json`),
        this.getBuildLogs(jobName, buildNumber),
      ]);
      const testReport = await this.getTestReport(jobName, buildNumber);
      return { ...this.mapBuild(build, jobName), logs, testReport: testReport ?? undefined };
    } catch (err) {
      logger.error(`Jenkins getBuildDetail failed`, { jobName, buildNumber, err });
      return null;
    }
  }

  /** Fetch raw console log text */
  async getBuildLogs(jobName: string, buildNumber: number): Promise<string> {
    try {
      const encodedJob = jobName.split('/').map(encodeURIComponent).join('/job/');
      const { data } = await this.client.get<string>(
        `/job/${encodedJob}/${buildNumber}/consoleText`,
        { responseType: 'text' }
      );
      // limit log size to 100 KB for AI processing
      return typeof data === 'string' ? data.slice(-100_000) : '';
    } catch {
      return '';
    }
  }

  /** Fetch JUnit test report if available */
  async getTestReport(jobName: string, buildNumber: number): Promise<TestReport | null> {
    try {
      const encodedJob = jobName.split('/').map(encodeURIComponent).join('/job/');
      const { data } = await this.client.get(
        `/job/${encodedJob}/${buildNumber}/testReport/api/json?tree=totalCount,passCount,failCount,skipCount,duration,suites[cases[duration,name,className,status]]`
      );
      const slowTests: SlowTest[] = [];
      const SLOW_THRESHOLD = 30_000; // 30s
      for (const suite of data.suites ?? []) {
        for (const c of suite.cases ?? []) {
          if ((c.duration ?? 0) * 1000 > SLOW_THRESHOLD) {
            slowTests.push({ name: `${c.className}.${c.name}`, duration: c.duration * 1000, threshold: SLOW_THRESHOLD });
          }
        }
      }
      return {
        total: data.totalCount ?? 0,
        passed: data.passCount ?? 0,
        failed: data.failCount ?? 0,
        skipped: data.skipCount ?? 0,
        duration: (data.duration ?? 0) * 1000,
        slowTests,
      };
    } catch {
      return null;
    }
  }

  /** Get all job names in Jenkins */
  async listJobs(): Promise<string[]> {
    try {
      const { data } = await this.client.get('/api/json?tree=jobs[name,fullName]');
      return (data.jobs ?? []).map((j: { fullName?: string; name: string }) => j.fullName ?? j.name);
    } catch (err) {
      logger.error('Jenkins listJobs failed', { err });
      return [];
    }
  }

  /** Trigger a build (retry) */
  async triggerBuild(jobName: string, params?: Record<string, string>): Promise<boolean> {
    try {
      const encodedJob = jobName.split('/').map(encodeURIComponent).join('/job/');
      const endpoint = params
        ? `/job/${encodedJob}/buildWithParameters`
        : `/job/${encodedJob}/build`;
      await this.client.post(endpoint, null, { params });
      return true;
    } catch (err) {
      logger.error('Jenkins triggerBuild failed', { jobName, err });
      return false;
    }
  }

  private mapBuild(b: Record<string, unknown>, jobName: string): BuildResult {
    const changeSets = (b.changeSets as Array<{ items: Array<{ commitId: string }> }>) ?? [];
    const commitSha = changeSets[0]?.items?.[0]?.commitId;
    return {
      id: `${jobName}#${b.number}`,
      jobName,
      buildNumber: b.number as number,
      status: this.mapStatus(b.result as string | null),
      timestamp: new Date(b.timestamp as number).toISOString(),
      duration: (b.duration as number) ?? 0,
      url: (b.url as string) ?? '',
      commitSha,
    };
  }

  private mapStatus(result: string | null): BuildResult['status'] {
    if (result === null) return 'IN_PROGRESS';
    const map: Record<string, BuildResult['status']> = {
      SUCCESS: 'SUCCESS', FAILURE: 'FAILURE', ABORTED: 'ABORTED', UNSTABLE: 'UNSTABLE',
    };
    return map[result] ?? 'FAILURE';
  }
}
