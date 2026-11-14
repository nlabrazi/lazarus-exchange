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

        stage('Notify Renovate PR') {
            when {
                changeRequest target: 'staging'
            }
            steps {
                notifyRenovatePr()
            }
        }

        stage('Install') {
            steps {
                npmCi()
                npmCi(workingDir: 'api', useGithubPackages: false)
            }
        }

        stage('Check') {
            steps {
                sh 'npm run check'
            }
        }

        stage('Unit tests') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
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
