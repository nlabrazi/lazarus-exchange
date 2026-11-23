@Library('nabster-ci') _

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Notify start') {
            steps {
                notifyTelegram('started')
            }
        }

        stage('Node CI') {
            agent {
                docker {
                    image 'node:22'
                    reuseNode true
                }
            }

            stages {
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
        }

        stage('Docker build & push') {
            steps {
                dockerBuildAndPush(
                    imageName: 'lazarus-exchange-api',
                    repoName: 'lazarus-exchange',
                    context: '.',
                    dockerfile: 'api/Dockerfile',
                    useGithubPackages: false
                )
                dockerBuildAndPush(
                    imageName: 'lazarus-exchange-ui',
                    repoName: 'lazarus-exchange',
                    context: '.',
                    dockerfile: 'ui/Dockerfile',
                    useGithubPackages: false
                )
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
