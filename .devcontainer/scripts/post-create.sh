#!/bin/bash
set -e

cd frontend
npm install
npx playwright install chromium
