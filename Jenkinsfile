@Library('nabster-ci') _

pipeline {
    agent {
        docker {
            image 'node:22'
        }
    }

    stages {
        stage('Notify start') {
            steps {
                notifyTelegram('started')
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
                dir('api') {
                    sh 'npm ci'
                }
            }
        }

        stage('Check') {
            steps {
                sh 'npm run check'
            }
        }

        stage('API unit tests') {
            steps {
                dir('api') {
                    sh 'npm test -- --runInBand'
                }
            }
        }

        stage('API build') {
            steps {
                dir('api') {
                    sh 'npm run build'
                }
            }
        }
    }

    post {
        success {
            notifyTelegram('success')
        }

        failure {
            notifyTelegram('failed')
        }
    }
}
