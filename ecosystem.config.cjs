module.exports = {
  apps: [
    {
      name: 'hoatdongdoan',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      listen_timeout: 10000,
      kill_timeout: 5000,
      max_memory_restart: '900M',
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'Asia/Ho_Chi_Minh',
      },
    },
  ],
};
