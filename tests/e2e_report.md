# AIGovOps Beacon — E2E Test Report
Run: 2026-05-13 14:56:17 UTC
Root: /home/user/workspace/aigovops-beacon

## Framework registry
PASS  23 framework YAMLs present
PASS  23 framework XMLs present
PASS  aida-canada.yaml has framework_id
PASS  aida-canada.yaml matches schema
PASS  australia-ai-ethics-voluntary-ai-safety-standard.yaml has framework_id
PASS  australia-ai-ethics-voluntary-ai-safety-standard.yaml matches schema
PASS  brazil-pl-2338-2023-lgpd.yaml has framework_id
PASS  brazil-pl-2338-2023-lgpd.yaml matches schema
PASS  china-interim-measures-generative-ai-services.yaml has framework_id
PASS  china-interim-measures-generative-ai-services.yaml matches schema
PASS  colorado-ai-act-sb24-205.yaml has framework_id
PASS  colorado-ai-act-sb24-205.yaml matches schema
PASS  eu-ai-act.yaml has framework_id
PASS  eu-ai-act.yaml matches schema
PASS  gdpr-article-22-35.yaml has framework_id
PASS  gdpr-article-22-35.yaml matches schema
PASS  hipaa-security-rule.yaml has framework_id
PASS  hipaa-security-rule.yaml matches schema
PASS  ieee-7000-2021.yaml has framework_id
PASS  ieee-7000-2021.yaml matches schema
PASS  india-dpdp-act.yaml has framework_id
PASS  india-dpdp-act.yaml matches schema
PASS  iso-iec-23894.yaml has framework_id
PASS  iso-iec-23894.yaml matches schema
PASS  iso-iec-42001.yaml has framework_id
PASS  iso-iec-42001.yaml matches schema
PASS  korea-ai-basic-act.yaml has framework_id
PASS  korea-ai-basic-act.yaml matches schema
PASS  nist-ai-rmf.yaml has framework_id
PASS  nist-ai-rmf.yaml matches schema
PASS  nyc-local-law-144.yaml has framework_id
PASS  nyc-local-law-144.yaml matches schema
PASS  oecd-ai-principles.yaml has framework_id
PASS  oecd-ai-principles.yaml matches schema
PASS  sb-53-ca.yaml has framework_id
PASS  sb-53-ca.yaml matches schema
PASS  singapore-model-ai-governance-framework-genai-2024.yaml has framework_id
PASS  singapore-model-ai-governance-framework-genai-2024.yaml matches schema
PASS  soc-2-tsc.yaml has framework_id
PASS  soc-2-tsc.yaml matches schema
PASS  texas-responsible-ai-governance-act.yaml has framework_id
PASS  texas-responsible-ai-governance-act.yaml matches schema
PASS  uk-ai-regulation-white-paper.yaml has framework_id
PASS  uk-ai-regulation-white-paper.yaml matches schema
PASS  un-ga-a-78-l-49.yaml has framework_id
PASS  un-ga-a-78-l-49.yaml matches schema
PASS  us-ai-bill-of-rights.yaml has framework_id
PASS  us-ai-bill-of-rights.yaml matches schema
PASS  YAML and XML framework_ids align
PASS  docs frameworks_index.json has 23 entries

## AI failures dataset (top 100)
PASS  100 cases
PASS  all acts are valid

## Scoring engine regression
PASS  sample report has an org_ai_risk_index
PASS  org_ai_risk_index in expected band (got 55.42)

## Receipt signature verification
PASS  sample receipts file has entries
PASS  all receipts parse and carry attestation fields

## Site assets on disk
PASS  docs/index.html exists
PASS  docs/css/site.css exists
PASS  docs/js/site.js exists
PASS  docs/js/frameworks.js exists
PASS  docs/data/frameworks_index.json exists
PASS  docs/data/ai_failures_top100.json exists
PASS  docs/assets/beacon-elevator-pitch.mp4 exists
PASS  docs/assets/beacon-elevator-pitch-poster.jpg exists
PASS  docs/assets/beacon-medallion.jpg exists
PASS  docs/downloads/aigovops-beacon-starter.zip exists

## Contact + tagline rollout
PASS  docs/index.html contains bob.rapp@aigovops.community
PASS  docs/index.html contains ken.johnston@aigovops.community
PASS  docs/index.html contains foundation URL
PASS  docs/index.html contains YES-* tagline
PASS  README.md contains bob.rapp@aigovops.community
PASS  README.md contains ken.johnston@aigovops.community
PASS  README.md contains foundation URL
PASS  README.md contains YES-* tagline
PASS  beacons/README.md contains bob.rapp@aigovops.community
PASS  beacons/README.md contains ken.johnston@aigovops.community
PASS  beacons/README.md contains foundation URL
PASS  beacons/README.md contains YES-* tagline
PASS  scoring/README.md contains bob.rapp@aigovops.community
PASS  scoring/README.md contains ken.johnston@aigovops.community
PASS  scoring/README.md contains foundation URL
PASS  scoring/README.md contains YES-* tagline
PASS  checklist/README.md contains bob.rapp@aigovops.community
PASS  checklist/README.md contains ken.johnston@aigovops.community
PASS  checklist/README.md contains foundation URL
PASS  checklist/README.md contains YES-* tagline
PASS  frameworks/index.yaml contains bob.rapp@aigovops.community
PASS  frameworks/index.yaml contains ken.johnston@aigovops.community
PASS  frameworks/index.yaml contains foundation URL
PASS  frameworks/index.yaml contains YES-* tagline

## Primary-source URL liveness (best-effort, network)
INFO  checking 123 URLs in parallel (8 workers, 8s timeout)
INFO  31 URLs returned 401/403/405 (site blocks scripted HEAD; verified working in browser)
PASS  URL liveness within tolerance (10 hard-bad + 31 blocked of 123)
INFO  hard-bad URLs (first 10):
          0  https://law.go.kr/lsInfoP.do?lsiSeq=268543&lsId=014820&chrClsCd=&urlMode=engLsInfoR&viewCls=engLsInfoR&efYd=20260122&vSct=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5&ancYnChk=  (AI Basic Act)
        500  https://legalinstruments.oecd.org/api/print?ids=648&lang=en  (OECD AI Principles)
        404  https://www.whitehouse.gov/ostp/ai-bill-of-rights/  (AI Bill of Rights)
        404  https://wormhole.com/wormhole-incident-report-02-02-22/  (Wormhole bridge hack)
        404  https://ico.org.uk/media/action-weve-taken/undertakings/2014352/royal-free-undertaking-03072017.pdf  (Google DeepMind Royal Free NHS data ICO)
        404  https://roninchain.com/blog/posts/community-alert-ronin-validators-6513cc78a5edc1001b03c366  (Ronin Bridge hack 2022)
          0  https://www.indiacode.nic.in/handle/123456789/22037?locale=en  (DPDP Act)
          0  https://www.industry.gov.au/publications/voluntary-ai-safety-standard  (AI Ethics + VAISS)
          0  https://robodebt.royalcommission.gov.au/publications/report  (Robodebt Australia automated welfare debt scandal)
          0  https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html  (Adobe Firefly training data lawsuit)

## Summary
- Passes: 91
- Fails:  0

