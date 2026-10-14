module.exports = {
  apps: [
    {
      name: "timber-api",
      script: "./dist/server.js",
      watch: false,
      env: {
        PORT: 8081,
        SECRET_KEY: process.env.SECRET_KEY, // nunca escribir la clave aquí
        DATABASE_NAME: "timber",
        DATABASE_URI: "mongodb://127.0.0.1:27017",
      },
    },
  ],
};
