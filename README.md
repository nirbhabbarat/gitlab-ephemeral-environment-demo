# Build Dynamic Environment using community version of GitLab and minikube at every merge request

## Content
  - .gitlab-ci.yml - CI & CD file
  - Dockerfile - used for builing images
  - gitlab-runner.yml - for registering runner to the repo
  - gitlab-admin-service-account.yml - for creating service account
  - src - contains sample nodejs and express code
  - manifest - kubernetes manifest files for learning
  - chart - helm chart of the same manifest file, it would used in the manifest file

# Setup gitlab on minikube using helm3

## Start minikube with virtualbox driver
You can also use other drivers, but i faced issues with bitnami images after restart of my computer or minikube, persistance volumes gets permission issues after remounting.
```
minikube start \
  --driver=virtualbox \
  --cpus 4 \
  --memory 8192
```
GitLab recomends: 8 CPU and 30 GB RAM but for demo we are going to use minimal setup, which should ideally run easily on 4-6 CPU and 6-8 GB RAM.
List of drivers supported by minikube: https://minikube.sigs.k8s.io/docs/drivers/

## Enable few minikube addons
We will be needing ingress for routing traffic from client and dashboard is good to have if you want GUI else you can ignore installing dashboard plugin.
```
minikube addons enable ingress
minikube addons enable dashboard
```
Read more: https://minikube.sigs.k8s.io/docs/commands/addons/

## Add Gitlab Helm Chart
This will be needed if you are going to use gitlab charts or use Auto DevOps features.
```
helm repo add gitlab https://charts.gitlab.io/
helm repo update
```

## Install GitLab in minikube
It would take 10-15 mins for complete setup to come healthy.
```
helm upgrade --install gitlab gitlab/gitlab \
   --timeout 600s   \
   --set global.hosts.domain=$(minikube ip).nip.io \
   --set global.hosts.externalIP=$(minikube ip) \
   -f https://gitlab.com/gitlab-org/charts/gitlab/raw/master/examples/values-minikube-minimum.yaml
```

## Watch pods
```
kubectl get pods -w
```
Till all the pods are not up and running, you won't be able to access the private gitlab. Sometimes it takes 15-20 mins and you might see some failures as well, its ok wait for some time.


## Get the gitlab initial password
You can change it later, but not required as of now as we are doing PoC.
```
kubectl get secret gitlab-gitlab-initial-root-password -ojsonpath='{.data.password}' | base64 --decode ; echo
```

## Open Gitlab in browser
Grab minikube ip by using below command and open the browser with something like below
```
minikube ip
```
Example URL
```
https://gitlab.192.168.99.100.nip.io/
```

# Configure Kubernetes Cluster with GitLab

## Enable outbound local network in gitlab admin

Goto: Admin Area -> Settings -> Network -> Outbound Requests Enable 
**Allow requests to the local network from web hooks and services** and Save

Example: https://gitlab.192.168.99.100.nip.io/admin/application_settings/network#js-outbound-settings

Read More: https://docs.gitlab.com/ee/security/webhooks.html

# Add Kubernetes cluster
Goto Admin Area -> Kubernetes ->  Add Kubernetes Cluster
You will need to fill follwing details of minikube cluster to get it started running.

## Get API URL

```
kubectl cluster-info | grep 'Kubernetes master' | awk '/http/ {print $NF}'

```

## Get CA Certificate
```
kubectl -n kube-system get secret $(kubectl -n kube-system get secrets|grep default| awk '{print $1}')  -o jsonpath="{['data']['ca\.crt']}" | base64 --decode
```



## Create Service Account
```
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gitlab-admin
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: gitlab-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: gitlab-admin
    namespace: kube-system

```
**Apply via kubectl**
```
kubectl apply -f gitlab-admin-service-account.yaml

```

## Get Admin Service token
```
kubectl -n kube-system describe secret $(kubectl -n kube-system get secret | grep gitlab-admin | awk '{print $1}')
```
**Note:** Not recommended for production

# GitLab Runners

### Steps
- Go to your testapp repo in private gitlab.
- Settings -> CI/CD -> Runners
- Copy the registration token and update the gitlab-runner.yaml


## Get Cert
Gitlab installs its application in gitlab-managed-apps namespace
```
kubectl create ns gitlab-managed-apps
```

```
kubectl get secret gitlab-wildcard-tls-ca -ojsonpath='{.data.cfssl_ca}' | base64 --decode > gitlab.192.168.99.100.nip.io.ca.pem
```
## Test the certificate
```
echo | openssl s_client -CAfile /etc/gitlab-runner/certs/gitlab-hostname.tld.crt -connect gitlab-hostname.tld:443

# Example
echo | openssl s_client -CAfile gitlab.192.168.99.100.nip.io.ca.pem  -connect gitlab.192.168.99.100.nip.io:443
```

## Set Cert
```
kubectl --namespace gitlab-managed-apps create secret generic gitlab-ssl \
	--from-file=gitlab.192.168.99.100.nip.io.crt=gitlab.192.168.99.100.nip.io.ca.pem
```
Set `certsSecretName` value in gitlab-runner.yaml

## Install runner

```
helm install gitlab-runner \
	-n gitlab-managed-apps \
	-f gitlab-runner.yaml gitlab/gitlab-runner
```
Read more: https://docs.gitlab.com/runner/install/kubernetes.html

## SSH to runner to check issues

```
kubectl exec -n gitlab-managed-apps  --stdin --tty $(kubectl get pods -n gitlab-managed-apps | grep runner | awk '{print $1}') -- /bin/bash

gitlab-runner register # And follow the steps
```
Read more: https://docs.gitlab.com/runner/register/

## Runner Troubleshooting guide
https://docs.gitlab.com/runner/faq/


## Create environment variables

Go to Repo - Settings -> CI/CD -> Runners
and create following environment

- CI_REGISTRY_USER=nirbhabbarat
- CI_REGISTRY_PASSWORD=**********
- CI_REGISTRY=docker.io
- CI_REGISTRY_IMAGE=index.docker.io/DockerHUBUserName/NameOfYourPrivateRepo

## Create similar kube secret for images to be pulled from private registry

```
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=nirbhabbarat  \
  --docker-password='**********'  \
  --docker-email=******************@gmail.com
```

### Add the name of the secret, which has the docker private credentials for docker hub
```
imagePullSecrets: ["name": "regcred"]
```
You can check chart/values.yml file for the same

# Grant admin access to runner namespace service account
This will be needed as helm commands are going to create resources under different namespaces.

```
kubectl create clusterrolebinding gitlab-managed-apps-clusteradmin \
   --clusterrole=cluster-admin \
   --serviceaccount=gitlab-managed-apps:default
```